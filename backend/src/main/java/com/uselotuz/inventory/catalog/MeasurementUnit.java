package com.uselotuz.inventory.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Factors map to pieces, grams or milliliters. No stock is stored in Phase 2. */
public enum MeasurementUnit {
    PIECE("COUNT", "1"), GRAM("MASS", "1"), KILOGRAM("MASS", "1000"),
    MILLILITER("VOLUME", "1"), LITER("VOLUME", "1000");
    public final String dimension;
    private final BigDecimal factor;
    MeasurementUnit(String dimension, String factor) { this.dimension = dimension; this.factor = new BigDecimal(factor); }
    public BigDecimal validate(BigDecimal quantity) {
        if (quantity == null || quantity.signum() < 0 || quantity.stripTrailingZeros().scale() > 6
                || quantity.precision() - quantity.scale() > 14)
            throw new IllegalArgumentException("Quantity must be nonnegative and fit NUMERIC(20,6)");
        if (this == PIECE && quantity.stripTrailingZeros().scale() > 0)
            throw new IllegalArgumentException("Pieces require whole numbers");
        return quantity;
    }
    public BigDecimal convert(BigDecimal quantity, MeasurementUnit target) {
        validate(quantity);
        if (!dimension.equals(target.dimension)) throw new IllegalArgumentException("Incompatible measurement dimensions");
        return target.validate(quantity.multiply(factor).divide(target.factor, 6, RoundingMode.UNNECESSARY));
    }
}
