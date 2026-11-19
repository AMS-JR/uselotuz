package com.uselotuz.inventory.catalog;

import java.math.BigDecimal;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class ReportService {
    private final StockService stock;
    private final ItemRepository items;
    private final NamedParameterJdbcTemplate jdbc;
    ReportService(StockService stock, ItemRepository items, NamedParameterJdbcTemplate jdbc) { this.stock=stock; this.items=items; this.jdbc=jdbc; }
    record StockRow(UUID itemId, String name, String sku, String category, String itemType, String unit, String currentStock, String minimum, String stockStatus) {}
    record MovementRow(UUID id, Instant date, String item, String sku, String movementType, String quantity, String unit, String reason) {}
    record Page<T>(List<T> items, long total, int page, int size) {}
    record Summary(long totalActiveItems, long lowStockItems, long outOfStockItems, long movementsInPeriod) {}
    record Filters(UUID business, UUID location, String q, String type, UUID category, String status, LocalDate from, LocalDate to, String movementType) {}
    private static final String STOCK_FROM = " from inventory_item i left join inventory_category c on c.business_id=i.business_id and c.id=i.category_id left join inventory_stock_threshold t on t.business_id=i.business_id and t.item_id=i.id and t.location_id=:location left join (select m.business_id,m.item_id,sum(m.quantity) balance, sum(case when m.movement_type='OPENING' then 1 else 0 end) openings from inventory_stock_movement m where m.business_id=:business and m.location_id=:location group by m.business_id,m.item_id) b on b.business_id=i.business_id and b.item_id=i.id where i.business_id=:business and i.archived=false";
    private static final String STATUS = "case when coalesce(b.openings,0)=0 then 'NOT_ESTABLISHED' when b.balance=0 then 'OUT_OF_STOCK' when t.quantity is null then 'NO_THRESHOLD' when b.balance<=t.quantity then 'LOW_STOCK' else 'IN_STOCK' end";
    private static final String MOVEMENT_FROM = " from inventory_stock_movement m join inventory_item i on i.business_id=m.business_id and i.id=m.item_id where m.business_id=:business and m.location_id=:location and m.created_at>=:fromTime and m.created_at<:toTime";
    Filters validate(UUID user, UUID business, UUID location, String q, String type, UUID category, String status, LocalDate from, LocalDate to, String movementType) {
        stock.validateLocation(user,business,location);
        String term=CatalogService.text(q,200,false,"Search");
        if(type!=null && !Set.of("PRODUCT","INGREDIENT").contains(type)) throw CatalogService.bad("Invalid item type");
        if(status!=null && !Set.of("IN_STOCK","LOW_STOCK","OUT_OF_STOCK","NOT_ESTABLISHED","NO_THRESHOLD").contains(status)) throw CatalogService.bad("Invalid stock status");
        if(movementType!=null && !Set.of("OPENING","RECEIPT","ADJUSTMENT","CONSUMPTION").contains(movementType)) throw CatalogService.bad("Invalid movement type");
        if(from==null || to==null || from.isAfter(to) || to.equals(LocalDate.MAX)) throw CatalogService.bad("Invalid date range");
        return new Filters(business,location,term==null ? "" : term.toLowerCase(Locale.ROOT),type,category,status,from,to,movementType);
    }
    private MapSqlParameterSource params(Filters f) {
        return new MapSqlParameterSource().addValue("business",f.business()).addValue("location",f.location()).addValue("q",f.q()).addValue("type",f.type()).addValue("category",f.category()).addValue("status",f.status()).addValue("movementType",f.movementType()).addValue("fromTime",Timestamp.from(f.from().atStartOfDay(ZoneOffset.UTC).toInstant())).addValue("toTime",Timestamp.from(f.to().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant()));
    }
    private String stockWhere(Filters f) { return STOCK_FROM+(f.q().isEmpty()?"":" and (lower(i.name) like :pattern or lower(coalesce(i.sku,'')) like :pattern)")+(f.type()==null?"":" and i.item_type=:type")+(f.category()==null?"":" and i.category_id=:category")+(f.status()==null?"":" and ("+STATUS+")=:status"); }
    private String movementWhere(Filters f) { return MOVEMENT_FROM+(f.q().isEmpty()?"":" and (lower(i.name) like :pattern or lower(coalesce(i.sku,'')) like :pattern)")+(f.movementType()==null?"":" and m.movement_type=:movementType"); }
    private MapSqlParameterSource queryParams(Filters f) { return params(f).addValue("pattern","%"+f.q()+"%"); }
    private void paging(int page,int size) { if(page<0 || page>100000 || size<1 || size>100) throw CatalogService.bad("Invalid page or size (1-100)"); }
    Page<StockRow> current(Filters f,int page,int size) {
        paging(page,size); String from=stockWhere(f); var p=queryParams(f).addValue("limit",size).addValue("offset",page*size);
        long count=jdbc.queryForObject("select count(*)"+from,p,Long.class);
        List<StockRow> rows=jdbc.query("select i.id,i.name,i.sku,c.name,i.item_type,i.unit,b.balance,t.quantity,"+STATUS+from+" order by i.name,i.id limit :limit offset :offset",p,(rs,n)->new StockRow(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6), decimal(rs.getBigDecimal(7)),decimal(rs.getBigDecimal(8)),rs.getString(9)));
        return new Page<>(rows,count,page,size);
    }
    Page<MovementRow> movements(Filters f,int page,int size) {
        paging(page,size); String from=movementWhere(f); var p=queryParams(f).addValue("limit",size).addValue("offset",page*size);
        long count=jdbc.queryForObject("select count(*)"+from,p,Long.class);
        List<MovementRow> rows=jdbc.query("select m.id,m.created_at,i.name,i.sku,m.movement_type,m.quantity,m.unit,coalesce(m.adjustment_reason,m.consumption_reason,m.notes,m.receipt_reference)"+from+" order by m.created_at desc,m.id desc limit :limit offset :offset",p,(rs,n)->new MovementRow(rs.getObject(1,UUID.class),rs.getTimestamp(2).toInstant(),rs.getString(3),rs.getString(4),rs.getString(5),decimal(rs.getBigDecimal(6)),rs.getString(7),rs.getString(8)));
        return new Page<>(rows,count,page,size);
    }
    Summary summary(UUID user, Filters f) {
        var alerts=stock.alerts(user,f.business(),f.location());
        long movementCount=jdbc.queryForObject("select count(*)"+MOVEMENT_FROM,params(f),Long.class);
        return new Summary(items.counts(f.business()).getTotal(),alerts.lowStock(),alerts.outOfStock(),movementCount);
    }
    private static String decimal(BigDecimal n) { return n==null?null:n.toPlainString(); }
    private static BigDecimal csvQuantity(String value) { return value==null ? null : new BigDecimal(value); }
    private static void row(Writer csv, Object... values) throws IOException { csv.write(String.join(",",Arrays.stream(values).map(value -> value instanceof BigDecimal number ? CatalogCsvService.numericCell(number) : CatalogCsvService.cell((String)value)).toList())); csv.write("\r\n"); }
    void export(Filters f,boolean movement,OutputStream output) throws IOException {
        Writer csv=new OutputStreamWriter(output,StandardCharsets.UTF_8);
        csv.write(movement?"date,item,sku,movement_type,quantity_change,unit,reason\r\n":"item,sku,category,item_type,unit,current_stock,minimum_stock,stock_status\r\n");
        int page=0; long total;
        do { if(movement) { var result=movements(f,page,100); total=result.total(); for(var r:result.items()) row(csv,r.date().toString(),r.item(),r.sku(),r.movementType(),csvQuantity(r.quantity()),r.unit(),r.reason()); }
             else { var result=current(f,page,100); total=result.total(); for(var r:result.items()) row(csv,r.name(),r.sku(),r.category(),r.itemType(),r.unit(),csvQuantity(r.currentStock()),csvQuantity(r.minimum()),r.stockStatus()); } page++; } while((long)page*100<total);
        csv.flush();
    }
}
