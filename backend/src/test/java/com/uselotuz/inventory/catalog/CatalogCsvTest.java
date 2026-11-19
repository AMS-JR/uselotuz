package com.uselotuz.inventory.catalog;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class CatalogCsvTest {
    @Test void parserHandlesQuotedNewlinesCommasEscapesAndEmptyLastColumns() {
        assertEquals(List.of(List.of("a,b","line1\nline2","a\"b","")),CatalogCsvService.parse("\"a,b\",\"line1\nline2\",\"a\"\"b\",\r\n"));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,() -> CatalogCsvService.parse("\"a\"junk,b"));
    }
    @Test void everyDangerousPrefixAndNumericTextIsProtected() {
        for(String s:List.of("=HYPERLINK(1)","+1","-1","@SUM(1)","\t=1","\r=1","  =1","000123","'text"))
            assertTrue(CatalogCsvService.cell(s).startsWith("\"'"));
    }
    @Test void reorderCsvUsesExactNumericCellsAndProtectsText() {
        var row=new ReorderService.Row(java.util.UUID.randomUUID(),"=Rice","000123","KILOGRAM",null,"+Supplier","0.000000","10.250000","10.250000","2.500000");
        assertEquals("\"'=Rice\",\"'000123\",0,10.25,10.25,2.5,\"KILOGRAM\",\"'+Supplier\"",ReorderService.csvRow(row));
        var whole=new ReorderService.Row(java.util.UUID.randomUUID(),"Rice","SKU","PIECE",null,null,"2.000000","5.000000","3.000000",null);
        assertEquals("\"Rice\",\"SKU\",2,5,3,\"\",\"PIECE\",\"\"",ReorderService.csvRow(whole));
        assertEquals("0.000001",CatalogCsvService.numericCell(new java.math.BigDecimal("0.000001")));
    }
}
