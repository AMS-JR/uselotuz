package com.uselotuz.inventory.catalog;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MeasurementUnitTest {
    @Test void compatibleConversionsAreExactDecimals() {
        assertEquals(0,new BigDecimal("1500").compareTo(MeasurementUnit.KILOGRAM.convert(new BigDecimal("1.5"),MeasurementUnit.GRAM)));
        assertEquals(0,new BigDecimal("1.25").compareTo(MeasurementUnit.MILLILITER.convert(new BigDecimal("1250"),MeasurementUnit.LITER)));
        assertEquals(0,new BigDecimal("0.000001").compareTo(MeasurementUnit.GRAM.convert(new BigDecimal("0.001"),MeasurementUnit.KILOGRAM)));
        assertEquals(0,BigDecimal.TEN.compareTo(MeasurementUnit.PIECE.convert(new BigDecimal("10.000000"),MeasurementUnit.PIECE)));
    }
    @Test void rejectsIncompatibleFractionalCountsNegativeOverflowAndRounding() {
        assertThrows(IllegalArgumentException.class,() -> MeasurementUnit.GRAM.convert(BigDecimal.ONE,MeasurementUnit.LITER));
        for(String n:new String[]{"1.5","-1","100000000000000","0.0000001"}) assertThrows(IllegalArgumentException.class,() -> MeasurementUnit.PIECE.validate(new BigDecimal(n)));
        assertThrows(ArithmeticException.class,() -> MeasurementUnit.GRAM.convert(new BigDecimal("0.000001"),MeasurementUnit.KILOGRAM));
        assertThrows(IllegalArgumentException.class,() -> MeasurementUnit.KILOGRAM.convert(new BigDecimal("99999999999999"),MeasurementUnit.GRAM));
        assertEquals(0,new BigDecimal("99999999999999.999999").compareTo(MeasurementUnit.GRAM.validate(new BigDecimal("99999999999999.999999"))));
    }
}
