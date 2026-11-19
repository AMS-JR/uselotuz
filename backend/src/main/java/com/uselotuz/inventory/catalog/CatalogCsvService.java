package com.uselotuz.inventory.catalog;

import static com.uselotuz.inventory.catalog.CatalogDtos.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.web.ErrorResponseException;

@Service
public class CatalogCsvService {
    public static final String HEADER="name,description,sku,barcode,item_type,unit,category_id,supplier_id,status";
    private static final int MAX_BYTES=1048576, MAX_ROWS=1000;
    private final CatalogService catalog;
    private final ItemRepository items;
    CatalogCsvService(CatalogService catalog, ItemRepository items) { this.catalog=catalog; this.items=items; }
    public record RowError(int row, String message) {}
    public record ImportResult(int imported) {}
    @Transactional
    public ImportResult importCsv(UUID user, UUID business, MultipartFile file) {
        catalog.authorize(user,business,true);
        if(file.isEmpty() || file.getSize()>MAX_BYTES) throw CatalogService.bad("CSV must contain 1-1048576 bytes");
        String text;
        try { text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(file.getBytes())).toString(); }
        catch(Exception e) { throw CatalogService.bad("CSV must be valid UTF-8"); }
        if(text.startsWith("\uFEFF")) text=text.substring(1);
        List<List<String>> rows=parse(text);
        if(rows.isEmpty() || !rows.removeFirst().equals(List.of(HEADER.split(",")))) throw CatalogService.bad("CSV headers must exactly match the catalog template");
        if(rows.isEmpty() || rows.size()>MAX_ROWS) throw CatalogService.bad("CSV requires 1-1000 data rows");
        var errors=new ArrayList<RowError>(); var pending=new ArrayList<StockItem>();
        var skus=new HashSet<String>(); var barcodes=new HashSet<String>(); var records=new HashSet<List<String>>();
        for(int n=0;n<rows.size();n++) {
            var row=rows.get(n).stream().map(CatalogCsvService::unprotect).toList();
            try {
                if(row.size()!=9) throw CatalogService.bad("Expected 9 columns");
                if(!row.get(8).equals("active")) throw CatalogService.bad("Only active new records can be imported");
                MeasurementUnit unit;
                try { unit=MeasurementUnit.valueOf(row.get(5)); } catch(Exception e) { throw CatalogService.bad("Unknown measurement unit"); }
                StockItem item=new StockItem(business);
                catalog.prepareItem(business,item,new ItemInput(row.get(0),row.get(1),row.get(2),row.get(3),row.get(4),unit,uuid(row.get(6)),uuid(row.get(7))));
                var fingerprint=Arrays.asList(item.name.toLowerCase(Locale.ROOT),item.description,item.skuKey,item.barcode,item.itemType,item.unit.name(),
                        Objects.toString(item.categoryId,""),Objects.toString(item.supplierId,""));
                if(!records.add(fingerprint)) throw CatalogService.bad("Duplicate record in this file");
                if(item.skuKey!=null && !skus.add(item.skuKey)) throw CatalogService.bad("Duplicate SKU in this file");
                if(item.barcode!=null && !barcodes.add(item.barcode)) throw CatalogService.bad("Duplicate barcode in this file");
                pending.add(item);
            } catch(org.springframework.web.server.ResponseStatusException e) { errors.add(new RowError(n+2,e.getReason())); }
        }
        if(!errors.isEmpty()) {
            ProblemDetail detail=ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"No records imported. Correct the listed rows and retry.");
            detail.setProperty("errors",errors); throw new ErrorResponseException(HttpStatus.BAD_REQUEST,detail,null);
        }
        items.saveAllAndFlush(pending);
        return new ImportResult(pending.size());
    }
    private static UUID uuid(String value) {
        if(value.isBlank()) return null;
        try { return UUID.fromString(value); } catch(IllegalArgumentException e) { throw CatalogService.bad("Reference must be a category/supplier UUID from this business"); }
    }
    @Transactional(readOnly=true)
    public byte[] exportCsv(UUID user, UUID business) {
        catalog.authorize(user,business,false);
        StringBuilder out=new StringBuilder(HEADER).append("\r\n");
        // Export all statuses. No external tenant or quantity data is included.
        for(var i:items.findByBusinessIdOrderByNameAsc(business)) {
            var values=Arrays.asList(i.name,i.description,i.sku,i.barcode,i.itemType,i.unit.name(),
                    i.categoryId==null ? null : i.categoryId.toString(),i.supplierId==null ? null : i.supplierId.toString(),i.archived ? "archived" : "active");
            out.append(String.join(",",values.stream().map(CatalogCsvService::cell).toList())).append("\r\n");
        }
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }
    private static boolean unsafe(String value) {
        if(value.isEmpty()) return false;
        char first=value.charAt(0);
        return "=+-@'".indexOf(first)>=0 || Character.isWhitespace(first) || Character.isISOControl(first) || Character.isDigit(first);
    }
    static String cell(String value) {
        if(value==null) value="";
        if(unsafe(value)) value="'"+value;
        return "\""+value.replace("\"","\"\"")+"\"";
    }
    static String numericCell(BigDecimal value) {
        return value == null ? cell(null) : value.stripTrailingZeros().toPlainString();
    }
    private static String unprotect(String value) {
        return value.startsWith("'") && unsafe(value.substring(1)) ? value.substring(1) : value;
    }
    /** Strict RFC4180-style reader, supporting quoted delimiters/newlines/doubled quotes. */
    static List<List<String>> parse(String text) {
        var rows=new ArrayList<List<String>>(); var row=new ArrayList<String>(); var field=new StringBuilder();
        boolean quoted=false, closed=false;
        for(int i=0;i<text.length();i++) {
            char c=text.charAt(i);
            if(quoted) {
                if(c=='"') { if(i+1<text.length() && text.charAt(i+1)=='"') {field.append('"'); i++;} else {quoted=false;closed=true;} }
                else field.append(c);
            } else if(c==',' || c=='\r' || c=='\n') {
                row.add(field.toString()); field.setLength(0); closed=false;
                if(c!=',') { rows.add(List.copyOf(row)); row.clear(); if(c=='\r' && i+1<text.length() && text.charAt(i+1)=='\n') i++; }
            } else if(c=='"' && field.isEmpty() && !closed) quoted=true;
            else { if(closed || c=='"') throw CatalogService.bad("Malformed CSV quoting"); field.append(c); }
            if(rows.size()>MAX_ROWS+1 || row.size()>9 || field.length()>10000) throw CatalogService.bad("CSV limits exceeded");
        }
        if(quoted) throw CatalogService.bad("Unclosed CSV quote");
        if(closed || !field.isEmpty() || !row.isEmpty()) { row.add(field.toString()); rows.add(List.copyOf(row)); }
        return rows;
    }
}
