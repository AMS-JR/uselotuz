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
}
