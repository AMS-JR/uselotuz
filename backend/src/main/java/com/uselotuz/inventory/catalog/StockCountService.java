package com.uselotuz.inventory.catalog;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
class StockCountService {
    private final CatalogService catalog;
    private final StockService stock;
    private final ItemRepository items;
    private final JdbcTemplate db;
    private final EntityManager em;
    StockCountService(CatalogService catalog,StockService stock,ItemRepository items,JdbcTemplate db,EntityManager em) { this.catalog=catalog; this.stock=stock; this.items=items; this.db=db; this.em=em; }
    record Create(UUID locationId,List<UUID> itemIds) {}
    record Entry(UUID itemId,String quantity) {}
    record Save(long version,List<Entry> items) {}
    record Version(long version) {}
    record CountItem(UUID itemId,String name,String sku,String unit,String recorded,String counted,String variance) {}
    record Count(UUID id,UUID locationId,String status,long version,UUID createdBy,Instant createdAt,UUID completedBy,Instant completedAt,List<CountItem> items) {}
    record CountPage(List<Count> items,long total,int page,int size) {}
    private static String decimal(BigDecimal n) { return n==null?null:n.toPlainString(); }
    private void lockBusiness(UUID business) { em.createNativeQuery("select id from business where id=:business for update").setParameter("business",business).getResultList(); }
    private void manage(UUID user,UUID business) { catalog.authorize(user,business,true); }
    private Count header(ResultSet rs,int n) throws SQLException { Timestamp completed=rs.getTimestamp(8); return new Count(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getLong(4),rs.getObject(5,UUID.class),rs.getTimestamp(6).toInstant(),rs.getObject(7,UUID.class),completed==null?null:completed.toInstant(),List.of()); }
    private Count load(UUID business,UUID id,boolean lock) {
        var rows=db.query("select id,location_id,status,version,created_by,created_at,completed_by,completed_at from inventory_stock_count where business_id=? and id=?"+(lock?" for update":""),this::header,business,id);
        if(rows.isEmpty()) throw CatalogService.missing();
        Count c=rows.getFirst();
        var lines=db.query("select ci.item_id,i.name,i.sku,ci.unit,ci.recorded_quantity,ci.counted_quantity from inventory_stock_count_item ci join inventory_item i on i.business_id=ci.business_id and i.id=ci.item_id where ci.business_id=? and ci.count_id=? order by i.name,i.id",(rs,n)->{
            BigDecimal recorded=rs.getBigDecimal(5),counted=rs.getBigDecimal(6);
            return new CountItem(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getString(4),decimal(recorded),decimal(counted),counted==null?null:decimal(counted.subtract(recorded)));
        },business,id);
        return new Count(c.id(),c.locationId(),c.status(),c.version(),c.createdBy(),c.createdAt(),c.completedBy(),c.completedAt(),lines);
    }
    private void editable(Count c,long version) {
        if(!Set.of("DRAFT","IN_PROGRESS").contains(c.status())) throw CatalogService.conflict("This count is already closed");
        if(c.version()!=version) throw CatalogService.conflict("This count changed. Reload it before continuing");
    }
    private long movementCount(UUID business,UUID location,UUID item) { return db.queryForObject("select count(*) from inventory_stock_movement where business_id=? and location_id=? and item_id=?",Long.class,business,location,item); }
    @Transactional(readOnly=true)
    CountPage list(UUID user,UUID business,UUID location,int page,int size) {
        stock.validateLocation(user,business,location);
        if(page<0 || page>100000 || size<1 || size>100) throw CatalogService.bad("Invalid page or size (1-100)");
        long total=db.queryForObject("select count(*) from inventory_stock_count where business_id=? and location_id=?",Long.class,business,location);
        var rows=db.query("select id,location_id,status,version,created_by,created_at,completed_by,completed_at from inventory_stock_count where business_id=? and location_id=? order by created_at desc,id desc limit ? offset ?",this::header,business,location,size,page*size);
        return new CountPage(rows,total,page,size);
    }
    @Transactional(readOnly=true)
    Count get(UUID user,UUID business,UUID id) { catalog.authorize(user,business,false); Count c=load(business,id,false); stock.validateLocation(user,business,c.locationId()); return c; }
    Count create(UUID user,UUID business,Create input) {
        manage(user,business);
        if(input==null || input.locationId()==null || input.itemIds()==null || input.itemIds().isEmpty() || input.itemIds().size()>100 || input.itemIds().stream().anyMatch(Objects::isNull) || new HashSet<>(input.itemIds()).size()!=input.itemIds().size()) throw CatalogService.bad("Select 1–100 distinct items");
        stock.validateLocation(user,business,input.locationId()); lockBusiness(business);
        UUID id=UUID.randomUUID();
        db.update("insert into inventory_stock_count(id,business_id,location_id,status,version,created_by,created_at) values (?,?,?,'DRAFT',0,?,?)",id,business,input.locationId(),user,Timestamp.from(Instant.now()));
        for(UUID itemId:input.itemIds().stream().sorted().toList()) {
            var item=items.lock(business,itemId).orElseThrow(CatalogService::missing);
            if(item.archived) throw CatalogService.conflict("Archived items cannot be counted");
            var state=stock.get(user,business,itemId,input.locationId());
            if(state.quantity()==null) throw CatalogService.conflict("Establish opening stock for each item before counting");
            db.update("insert into inventory_stock_count_item(id,business_id,count_id,item_id,unit,recorded_quantity,movement_count) values (?,?,?,?,?,?,?)",UUID.randomUUID(),business,id,itemId,item.unit.name(),new BigDecimal(state.quantity()),movementCount(business,input.locationId(),itemId));
        }
        return load(business,id,false);
    }
    Count save(UUID user,UUID business,UUID id,Save input) {
        manage(user,business); if(input==null || input.items()==null) throw CatalogService.bad("Count items are required");
        lockBusiness(business); Count c=load(business,id,true); editable(c,input.version()); stock.validateLocation(user,business,c.locationId());
        var supplied=new HashMap<UUID,String>();
        for(Entry e:input.items()) { if(e==null || e.itemId()==null || supplied.containsKey(e.itemId())) throw CatalogService.bad("Each count item must appear once"); supplied.put(e.itemId(),e.quantity()); }
        if(supplied.size()!=c.items().size() || c.items().stream().anyMatch(i->!supplied.containsKey(i.itemId()))) throw CatalogService.bad("Provide every count item");
        boolean any=false;
        for(CountItem line:c.items()) {
            String value=supplied.get(line.itemId()); BigDecimal amount=null;
            if(value!=null && !value.isBlank()) {
                try { if(value.length()>32 || !value.matches("[0-9]+(\\.[0-9]+)?")) throw new IllegalArgumentException("Enter a valid nonnegative quantity"); amount=MeasurementUnit.valueOf(line.unit()).validate(new BigDecimal(value)); }
                catch(IllegalArgumentException e) { throw CatalogService.bad(e.getMessage()); }
                any=true;
            }
            db.update("update inventory_stock_count_item set counted_quantity=? where business_id=? and count_id=? and item_id=?",amount,business,id,line.itemId());
        }
        db.update("update inventory_stock_count set status=?,version=version+1 where business_id=? and id=?",any?"IN_PROGRESS":"DRAFT",business,id);
        return load(business,id,false);
    }
    Count refresh(UUID user,UUID business,UUID id,Version input) {
        manage(user,business); if(input==null) throw CatalogService.bad("Version required"); lockBusiness(business); Count c=load(business,id,true); editable(c,input.version()); stock.validateLocation(user,business,c.locationId());
        for(CountItem line:c.items().stream().sorted(Comparator.comparing(CountItem::itemId)).toList()) {
            var item=items.lock(business,line.itemId()).orElseThrow(CatalogService::missing);
            if(item.archived) throw CatalogService.conflict("Archived items cannot be counted");
            var state=stock.get(user,business,line.itemId(),c.locationId());
            if(state.quantity()==null) throw CatalogService.conflict("Opening stock is required");
            db.update("update inventory_stock_count_item set recorded_quantity=?,counted_quantity=null,movement_count=? where business_id=? and count_id=? and item_id=?",new BigDecimal(state.quantity()),movementCount(business,c.locationId(),line.itemId()),business,id,line.itemId());
        }
        db.update("update inventory_stock_count set status='DRAFT',version=version+1 where business_id=? and id=?",business,id); return load(business,id,false);
    }
    Count cancel(UUID user,UUID business,UUID id,Version input) {
        manage(user,business); if(input==null) throw CatalogService.bad("Version required"); lockBusiness(business); Count c=load(business,id,true); editable(c,input.version()); stock.validateLocation(user,business,c.locationId());
        db.update("update inventory_stock_count set status='CANCELLED',version=version+1 where business_id=? and id=?",business,id); return load(business,id,false);
    }
    Count confirm(UUID user,UUID business,UUID id,Version input) {
        manage(user,business); if(input==null) throw CatalogService.bad("Version required"); lockBusiness(business); Count c=load(business,id,true); editable(c,input.version()); stock.validateLocation(user,business,c.locationId());
        if(c.items().isEmpty() || c.items().stream().anyMatch(i->i.counted()==null)) throw CatalogService.bad("Count every selected item before confirming");
        for(CountItem line:c.items().stream().sorted(Comparator.comparing(CountItem::itemId)).toList()) {
            var item=items.lock(business,line.itemId()).orElseThrow(CatalogService::missing);
            if(item.archived || !item.unit.name().equals(line.unit())) throw CatalogService.conflict("An item changed; refresh the count and recount");
            long snapshot=db.queryForObject("select movement_count from inventory_stock_count_item where business_id=? and count_id=? and item_id=?",Long.class,business,id,line.itemId());
            if(snapshot!=movementCount(business,c.locationId(),line.itemId())) throw CatalogService.conflict("Stock changed during this count. Refresh and recount before confirming");
        }
        for(CountItem line:c.items()) {
            BigDecimal difference=new BigDecimal(line.counted()).subtract(new BigDecimal(line.recorded()));
            if(difference.signum()!=0) {
                UUID key=UUID.nameUUIDFromBytes(("stock-count:"+id+":"+line.itemId()).getBytes(StandardCharsets.UTF_8));
                stock.adjust(user,business,line.itemId(),new StockService.Adjustment(c.locationId(),difference.toPlainString(),"Physical stock count "+id,key));
            }
        }
        db.update("update inventory_stock_count set status='COMPLETED',version=version+1,completed_by=?,completed_at=? where business_id=? and id=?",user,Timestamp.from(Instant.now()),business,id);
        return load(business,id,false);
    }
}
