package com.uselotuz.inventory.catalog;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Transactional
class ReorderService {
    private final CatalogService catalog;
    private final StockService stock;
    private final ItemRepository items;
    private final ReorderPlanRepository plans;
    private final StockThresholdRepository thresholds;
    private final StockMovementRepository movements;
    private final EntityManager em;
    ReorderService(CatalogService catalog, StockService stock, ItemRepository items, ReorderPlanRepository plans, EntityManager em, StockThresholdRepository thresholds, StockMovementRepository movements) {
        this.catalog=catalog; this.stock=stock; this.items=items; this.plans=plans; this.em=em; this.thresholds=thresholds; this.movements=movements;
    }
    record Row(UUID itemId, String name, String sku, String unit, UUID supplierId, String supplier, String currentStock, String minimum, String suggested, String planned) {}
    record Result(List<Row> items, long total, int page, int size) {}
    record PlanInput(UUID locationId, String quantity) {}
    private static final String FROM=" from inventory_item i join inventory_stock_threshold t on t.business_id=i.business_id and t.item_id=i.id and t.location_id=:location join (select m.business_id,m.item_id,sum(m.quantity) balance from inventory_stock_movement m where m.business_id=:business and m.location_id=:location group by m.business_id,m.item_id having sum(case when m.movement_type='OPENING' then 1 else 0 end)>0) b on b.business_id=i.business_id and b.item_id=i.id left join inventory_supplier s on s.business_id=i.business_id and s.id=i.supplier_id left join inventory_reorder_plan p on p.business_id=i.business_id and p.item_id=i.id and p.location_id=:location where i.business_id=:business and i.archived=false and b.balance < t.quantity";
    private String filters(String q, String type, UUID supplier) {
        return (q.isEmpty() ? "" : " and (strpos(lower(i.name),:q)>0 or strpos(lower(coalesce(i.sku,'')),:q)>0)")+(type==null ? "" : " and i.item_type=:type")+(supplier==null ? "" : " and i.supplier_id=:supplier");
    }
    private Query bind(Query query, UUID business, UUID location, String q, String type, UUID supplier) {
        query.setParameter("business",business).setParameter("location",location);
        if(!q.isEmpty()) query.setParameter("q",q);
        if(type!=null) query.setParameter("type",type);
        if(supplier!=null) query.setParameter("supplier",supplier);
        return query;
    }
    private String search(String q, String type) {
        String text=CatalogService.text(q,200,false,"Search");
        if(type!=null && !Set.of("PRODUCT","INGREDIENT").contains(type)) throw CatalogService.bad("Invalid item type");
        return text==null ? "" : text.toLowerCase(Locale.ROOT);
    }
    @Transactional(readOnly=true)
    Result list(UUID user, UUID business, UUID location, String q, String type, UUID supplier, int page, int size) {
        stock.validateLocation(user,business,location);
        if(page<0 || page>100000 || size<1 || size>100) throw CatalogService.bad("Invalid page or size (1-100)");
        String term=search(q,type); String from=FROM+filters(term,type,supplier);
        long total=((Number)bind(em.createNativeQuery("select count(*)"+from),business,location,term,type,supplier).getSingleResult()).longValue();
        List<Row> rows=rows(business,location,term,type,supplier,from,page*size,size);
        return new Result(rows,total,page,size);
    }
    private List<Row> rows(UUID business, UUID location, String q, String type, UUID supplier, String from, int offset, int limit) {
        Query query=bind(em.createNativeQuery("select i.id,i.name,i.sku,i.unit,s.id,s.name,b.balance,t.quantity,p.quantity"+from+" order by i.name, i.id"),business,location,q,type,supplier);
        if(limit>0) query.setFirstResult(offset).setMaxResults(limit);
        List<Row> result=new ArrayList<>();
        for(Object entry:query.getResultList()) {
            Object[] r=(Object[])entry; BigDecimal balance=(BigDecimal)r[6], min=(BigDecimal)r[7], planned=(BigDecimal)r[8];
            result.add(new Row((UUID)r[0],(String)r[1],(String)r[2],(String)r[3],(UUID)r[4],(String)r[5],balance.toPlainString(),min.toPlainString(),min.subtract(balance).toPlainString(),planned==null ? null : planned.toPlainString()));
        }
        return result;
    }
    @Transactional(readOnly=true)
    byte[] export(UUID user, UUID business, UUID location, String q, String type, UUID supplier) {
        stock.validateLocation(user,business,location); String term=search(q,type);
        var rows=rows(business,location,term,type,supplier,FROM+filters(term,type,supplier),0,0);
        StringBuilder csv=new StringBuilder("item,sku,current_stock,minimum,suggested,planned,unit,supplier\r\n");
        for(var row:rows) csv.append(csvRow(row)).append("\r\n");
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }
    private static String number(String value) { return CatalogCsvService.numericCell(value==null ? null : new BigDecimal(value)); }
    static String csvRow(Row row) {
        return String.join(",",CatalogCsvService.cell(row.name()),CatalogCsvService.cell(row.sku()),number(row.currentStock()),number(row.minimum()),number(row.suggested()),number(row.planned()),CatalogCsvService.cell(row.unit()),CatalogCsvService.cell(row.supplier()));
    }
    void setPlan(UUID user, UUID business, UUID itemId, PlanInput input) {
        catalog.authorize(user,business,true);
        if(input==null) throw CatalogService.bad("Location is required");
        stock.validateLocation(user,business,input.locationId());
        var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
        if(item.archived) throw CatalogService.conflict("Archived items cannot be planned");
        var existing=plans.findByBusinessIdAndItemIdAndLocationId(business,itemId,input.locationId());
        if(input.quantity()==null) { existing.ifPresent(plans::delete); return; }
        BigDecimal quantity;
        try {
            if(input.quantity().length()>32 || !input.quantity().matches("[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid nonnegative quantity");
            quantity=item.unit.validate(new BigDecimal(input.quantity()));
        } catch(IllegalArgumentException e) { throw CatalogService.bad(e.getMessage()); }
        var threshold=thresholds.findByBusinessIdAndItemIdAndLocationId(business,itemId,input.locationId());
        var opening=movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,itemId,input.locationId(),"OPENING");
        if(threshold.isEmpty() || opening.isEmpty() || movements.balance(business,itemId,input.locationId()).compareTo(threshold.get().quantity)>=0) throw CatalogService.conflict("Item is not currently below its minimum");
        var plan=existing.orElseGet(() -> new ReorderPlan(business,itemId,input.locationId()));
        plan.quantity=quantity; plan.updatedBy=user; plan.updatedAt=Instant.now(); plans.save(plan);
    }
}
