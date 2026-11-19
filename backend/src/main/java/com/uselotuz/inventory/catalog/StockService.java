package com.uselotuz.inventory.catalog;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@Service
@Transactional
class StockService {
    private final CatalogService catalog;
    private final ItemRepository items;
    private final StockMovementRepository movements;
    private final EntityManager entityManager;
    private final SupplierRepository suppliers;
    private final StockThresholdRepository thresholds;
    StockService(CatalogService catalog, ItemRepository items, StockMovementRepository movements, EntityManager entityManager, SupplierRepository suppliers, StockThresholdRepository thresholds) {
        this.catalog=catalog; this.items=items; this.movements=movements; this.entityManager=entityManager; this.suppliers=suppliers; this.thresholds=thresholds;
    }
    private void location(UUID business, UUID location) {
        if (location==null || entityManager.createNativeQuery("select id from inventory_location where business_id = :business and id = :location")
                .setParameter("business",business).setParameter("location",location).getResultList().isEmpty())
            throw CatalogService.bad("Location must belong to this business");
    }
    void validateLocation(UUID user, UUID business, UUID locationId) { catalog.authorize(user,business,false); location(business,locationId); }
    record State(UUID itemId, UUID locationId, String quantity, MeasurementUnit unit, String threshold, String stockStatus) {}
    record ThresholdInput(UUID locationId, String quantity) {}
    record Alerts(long lowStock, long outOfStock) {}
    private State state(StockItem item, UUID locationId, BigDecimal balance, BigDecimal threshold) {
        String status=balance==null ? "NOT_ESTABLISHED" : balance.signum()==0 ? "OUT_OF_STOCK" : threshold==null ? "NO_THRESHOLD" : balance.compareTo(threshold)<=0 ? "LOW_STOCK" : "IN_STOCK";
        return new State(item.id,locationId,balance==null ? null : balance.toPlainString(),item.unit,threshold==null ? null : threshold.toPlainString(),status);
    }
    record Opening(UUID locationId, String quantity) {}
    record Receipt(UUID locationId, String quantity, UUID supplierId, String reference, String notes, UUID idempotencyKey) {}
    record ReceiptView(UUID movementId, UUID itemId, String quantityReceived, String currentQuantity, MeasurementUnit unit, Instant createdAt) {}
    record Adjustment(UUID locationId, String quantity, String reason, UUID idempotencyKey) {}
    record AdjustmentView(UUID movementId, UUID itemId, String quantity, String currentQuantity, MeasurementUnit unit, Instant createdAt) {}
    record Consumption(UUID locationId, String quantity, String reason, UUID idempotencyKey) {}
    record ConsumptionView(UUID movementId, UUID itemId, String quantityConsumed, String currentQuantity, MeasurementUnit unit, Instant createdAt) {}
    record MovementView(UUID id, String type, String quantity, MeasurementUnit unit, UUID createdBy, Instant createdAt, String reason, UUID supplierId, String reference, String notes) {}
    record History(List<MovementView> movements, long total, int page, int size) {}
    @Transactional(readOnly=true)
    State get(UUID user, UUID business, UUID itemId, UUID locationId) {
        catalog.authorize(user,business,false); location(business,locationId);
        var item=items.findByBusinessIdAndId(business,itemId).orElseThrow(CatalogService::missing);
        var movement=movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,itemId,locationId,"OPENING");
        return state(item,locationId,movement.isPresent() ? movements.balance(business,itemId,locationId) : null,thresholds.findByBusinessIdAndItemIdAndLocationId(business,itemId,locationId).map(t -> t.quantity).orElse(null));
    }
    @Transactional(readOnly=true)
    List<State> list(UUID user, UUID business, UUID locationId, List<UUID> ids) {
        catalog.authorize(user,business,false); location(business,locationId);
        if (ids==null || ids.size()>100) throw CatalogService.bad("Specify up to 100 items");
        if (ids.isEmpty()) return List.of();
        var found=items.findByBusinessIdAndIdIn(business,ids);
        if (found.size()!=new HashSet<>(ids).size()) throw CatalogService.missing();
        var stock=movements.findByBusinessIdAndLocationIdAndItemIdIn(business,locationId,ids);
        var quantities=new HashMap<UUID,BigDecimal>();
        var initialized=new HashSet<UUID>();
        for(var m:stock) { quantities.merge(m.itemId,m.quantity,BigDecimal::add); if(m.movementType.equals("OPENING")) initialized.add(m.itemId); }
        var limits=new HashMap<UUID,BigDecimal>();
        for(var t:thresholds.findByBusinessIdAndLocationIdAndItemIdIn(business,locationId,ids)) limits.put(t.itemId,t.quantity);
        return found.stream().map(i -> state(i,locationId,initialized.contains(i.id) ? quantities.get(i.id) : null,limits.get(i.id))).toList();
    }
    State open(UUID user, UUID business, UUID itemId, Opening input) {
        catalog.authorize(user,business,true); location(business,input.locationId());
        var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
        if(item.archived) throw CatalogService.conflict("Archived items cannot be initialized");
        if(movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,itemId,input.locationId(),"OPENING").isPresent())
            throw CatalogService.conflict("Opening stock has already been established");
        BigDecimal quantity;
        try {
            if(input.quantity()==null || input.quantity().length()>32 || !input.quantity().matches("[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid nonnegative quantity");
            quantity=item.unit.validate(new BigDecimal(input.quantity()));
        } catch (IllegalArgumentException ex) { throw CatalogService.bad(ex.getMessage()); }
        movements.saveAndFlush(new StockMovement(business,itemId,input.locationId(),quantity,item.unit,user));
        return state(item,input.locationId(),quantity,thresholds.findByBusinessIdAndItemIdAndLocationId(business,itemId,input.locationId()).map(t -> t.quantity).orElse(null));
    }
    State setThreshold(UUID user, UUID business, UUID itemId, ThresholdInput input) {
        catalog.authorize(user,business,true);
        if(input==null) throw CatalogService.bad("Location is required");
        location(business,input.locationId());
        var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
        if(item.archived) throw CatalogService.conflict("Archived items cannot be changed");
        var existing=thresholds.findByBusinessIdAndItemIdAndLocationId(business,itemId,input.locationId());
        if(input.quantity()==null) existing.ifPresent(thresholds::delete);
        else {
            BigDecimal value;
            try {
                if(input.quantity().length()>32 || !input.quantity().matches("[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid nonnegative threshold");
                value=item.unit.validate(new BigDecimal(input.quantity()));
            } catch(IllegalArgumentException ex) { throw CatalogService.bad(ex.getMessage()); }
            var threshold=existing.orElseGet(() -> new StockThreshold(business,itemId,input.locationId(),value));
            threshold.quantity=value; thresholds.save(threshold);
        }
        thresholds.flush();
        return state(item,input.locationId(),movements.balance(business,itemId,input.locationId()),input.quantity()==null ? null : new BigDecimal(input.quantity()));
    }
    @Transactional(readOnly=true)
    Alerts alerts(UUID user, UUID business, UUID locationId) {
        validateLocation(user,business,locationId);
        Object[] row=(Object[]) entityManager.createNativeQuery("select coalesce(sum(case when s.balance > 0 and t.quantity is not null and s.balance <= t.quantity then 1 else 0 end),0), coalesce(sum(case when s.balance = 0 then 1 else 0 end),0) from (select m.item_id, sum(m.quantity) as balance from inventory_stock_movement m join inventory_item i on i.business_id=m.business_id and i.id=m.item_id where m.business_id=:business and m.location_id=:location and i.archived=false group by m.item_id having sum(case when m.movement_type='OPENING' then 1 else 0 end)>0) s left join inventory_stock_threshold t on t.business_id=:business and t.location_id=:location and t.item_id=s.item_id")
            .setParameter("business",business).setParameter("location",locationId).getSingleResult();
        return new Alerts(((Number)row[0]).longValue(),((Number)row[1]).longValue());
    }
    ReceiptView receive(UUID user, UUID business, UUID itemId, Receipt input) {
        catalog.authorize(user,business,true);
        if (input==null || input.idempotencyKey()==null) throw CatalogService.bad("An idempotency key is required");
        location(business,input.locationId());
        // Serialize keys across all items in the business, including simultaneous retries.
        entityManager.createNativeQuery("select id from business where id = :business for update").setParameter("business",business).getResultList();
        var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
        BigDecimal quantity;
        try {
            if(input.quantity()==null || input.quantity().length()>32 || !input.quantity().matches("[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid positive quantity");
            quantity=item.unit.validate(new BigDecimal(input.quantity()));
            if(quantity.signum()<=0) throw new IllegalArgumentException("Receiving quantity must be greater than zero");
        } catch (IllegalArgumentException ex) { throw CatalogService.bad(ex.getMessage()); }
        String reference=CatalogService.text(input.reference(),200,false,"Reference");
        String notes=CatalogService.text(input.notes(),2000,false,"Notes");
        var existing=movements.findByBusinessIdAndIdempotencyKey(business,input.idempotencyKey());
        if(existing.isPresent()) {
            var m=existing.get();
            if(!m.movementType.equals("RECEIPT") || !m.itemId.equals(itemId) || !m.locationId.equals(input.locationId()) || m.quantity.compareTo(quantity)!=0 || !Objects.equals(m.supplierId,input.supplierId()) || !Objects.equals(m.receiptReference,reference) || !Objects.equals(m.notes,notes))
                throw CatalogService.conflict("Idempotency key already used for a different receipt");
            return receiptView(m,movements.balance(business,itemId,input.locationId()));
        }
        if(item.archived) throw CatalogService.conflict("Archived items cannot receive stock");
        if(movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,itemId,input.locationId(),"OPENING").isEmpty()) throw CatalogService.conflict("Establish opening stock before receiving inventory");
        if(input.supplierId()!=null && suppliers.lock(business,input.supplierId()).filter(s -> !s.archived).isEmpty()) throw CatalogService.bad("Supplier must be active and belong to this business");
        var m=new StockMovement(business,itemId,input.locationId(),quantity,item.unit,user);
        m.movementType="RECEIPT"; m.supplierId=input.supplierId(); m.receiptReference=reference; m.notes=notes; m.idempotencyKey=input.idempotencyKey();
        movements.saveAndFlush(m);
        return receiptView(m,movements.balance(business,itemId,input.locationId()));
    }
    private ReceiptView receiptView(StockMovement m, BigDecimal balance) {
        return new ReceiptView(m.id,m.itemId,m.quantity.toPlainString(),balance.toPlainString(),m.unit,m.createdAt);
    }
    AdjustmentView adjust(UUID user, UUID business, UUID itemId, Adjustment input) {
        catalog.authorize(user,business,true);
        if(input==null || input.idempotencyKey()==null) throw CatalogService.bad("An idempotency key is required");
        location(business,input.locationId());
        entityManager.createNativeQuery("select id from business where id = :business for update").setParameter("business",business).getResultList();
        var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
        BigDecimal quantity;
        try {
            if(input.quantity()==null || input.quantity().length()>33 || !input.quantity().matches("-?[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid nonzero quantity");
            quantity=new BigDecimal(input.quantity());
            item.unit.validate(quantity.abs());
            if(quantity.signum()==0) throw new IllegalArgumentException("Adjustment must be nonzero");
        } catch(IllegalArgumentException ex) { throw CatalogService.bad(ex.getMessage()); }
        String reason=CatalogService.text(input.reason(),500,true,"Reason");
        var existing=movements.findByBusinessIdAndIdempotencyKey(business,input.idempotencyKey());
        if(existing.isPresent()) {
            var m=existing.get();
            if(!m.movementType.equals("ADJUSTMENT") || !m.itemId.equals(itemId) || !m.locationId.equals(input.locationId()) || m.quantity.compareTo(quantity)!=0 || !Objects.equals(m.adjustmentReason,reason)) throw CatalogService.conflict("Idempotency key already used for a different movement");
            return adjustmentView(m,movements.balance(business,itemId,input.locationId()));
        }
        if(item.archived) throw CatalogService.conflict("Archived items cannot be adjusted");
        if(movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,itemId,input.locationId(),"OPENING").isEmpty()) throw CatalogService.conflict("Establish opening stock before adjusting inventory");
        var balance=movements.balance(business,itemId,input.locationId());
        if(balance.add(quantity).signum()<0) throw CatalogService.conflict("Adjustment would make stock negative");
        var m=new StockMovement(business,itemId,input.locationId(),quantity,item.unit,user);
        m.movementType="ADJUSTMENT"; m.adjustmentReason=reason; m.idempotencyKey=input.idempotencyKey();
        movements.saveAndFlush(m);
        return adjustmentView(m,balance.add(quantity));
    }
    private AdjustmentView adjustmentView(StockMovement m, BigDecimal balance) {
        return new AdjustmentView(m.id,m.itemId,m.quantity.toPlainString(),balance.toPlainString(),m.unit,m.createdAt);
    }
    ConsumptionView consume(UUID user, UUID business, UUID itemId, Consumption input) {
        catalog.authorize(user,business,true);
        if(input==null || input.idempotencyKey()==null) throw CatalogService.bad("An idempotency key is required");
        location(business,input.locationId());
        entityManager.createNativeQuery("select id from business where id = :business for update").setParameter("business",business).getResultList();
        var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
        BigDecimal quantity;
        try {
            if(input.quantity()==null || input.quantity().length()>32 || !input.quantity().matches("[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid positive quantity");
            quantity=item.unit.validate(new BigDecimal(input.quantity()));
            if(quantity.signum()<=0) throw new IllegalArgumentException("Consumption quantity must be greater than zero");
        } catch(IllegalArgumentException ex) { throw CatalogService.bad(ex.getMessage()); }
        String reason=CatalogService.text(input.reason(),500,true,"Reason");
        var existing=movements.findByBusinessIdAndIdempotencyKey(business,input.idempotencyKey());
        if(existing.isPresent()) {
            var m=existing.get();
            if(!m.movementType.equals("CONSUMPTION") || !m.itemId.equals(itemId) || !m.locationId.equals(input.locationId()) || m.quantity.compareTo(quantity.negate())!=0 || !Objects.equals(m.consumptionReason,reason)) throw CatalogService.conflict("Idempotency key already used for a different movement");
            return consumptionView(m,movements.balance(business,itemId,input.locationId()));
        }
        if(item.archived) throw CatalogService.conflict("Archived items cannot be consumed");
        if(movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,itemId,input.locationId(),"OPENING").isEmpty()) throw CatalogService.conflict("Establish opening stock before consuming inventory");
        var balance=movements.balance(business,itemId,input.locationId());
        if(balance.compareTo(quantity)<0) throw CatalogService.conflict("Insufficient stock");
        var m=new StockMovement(business,itemId,input.locationId(),quantity.negate(),item.unit,user);
        m.movementType="CONSUMPTION"; m.consumptionReason=reason; m.idempotencyKey=input.idempotencyKey();
        movements.saveAndFlush(m);
        return consumptionView(m,balance.subtract(quantity));
    }
    private ConsumptionView consumptionView(StockMovement m, BigDecimal balance) {
        return new ConsumptionView(m.id,m.itemId,m.quantity.negate().toPlainString(),balance.toPlainString(),m.unit,m.createdAt);
    }
    @Transactional(readOnly=true)
    History history(UUID user, UUID business, UUID itemId, UUID locationId, int page, int size) {
        catalog.authorize(user,business,false); location(business,locationId);
        items.findByBusinessIdAndId(business,itemId).orElseThrow(CatalogService::missing);
        if(page<0 || page>100000 || size<1 || size>100) throw CatalogService.bad("Invalid page or size (1-100)");
        var result=movements.findByBusinessIdAndItemIdAndLocationId(business,itemId,locationId,PageRequest.of(page,size,Sort.by(Sort.Order.desc("createdAt"),Sort.Order.desc("id"))));
        return new History(result.stream().map(m -> new MovementView(m.id,m.movementType,m.quantity.toPlainString(),m.unit,m.createdBy,m.createdAt,m.movementType.equals("CONSUMPTION") ? m.consumptionReason : m.adjustmentReason,m.supplierId,m.receiptReference,m.notes)).toList(),result.getTotalElements(),page,size);
    }
}
