package com.uselotuz.inventory.catalog;

import static com.uselotuz.inventory.catalog.CatalogDtos.*;
import com.uselotuz.access.AccessService;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class CatalogService {
    private final AccessService access;
    private final ItemRepository items;
    private final CategoryRepository categories;
    private final SupplierRepository suppliers;
    private final StockMovementRepository movements;
    private final StockThresholdRepository thresholds;
    CatalogService(AccessService access, ItemRepository items, CategoryRepository categories, SupplierRepository suppliers, StockMovementRepository movements, StockThresholdRepository thresholds) {
        this.access=access; this.items=items; this.categories=categories; this.suppliers=suppliers; this.movements=movements; this.thresholds=thresholds;
    }
    void authorize(UUID user, UUID business, boolean manage) {
        access.require(user,business,"inventory",manage ? AccessService.Permission.MANAGE : AccessService.Permission.VIEW);
    }
    static ResponseStatusException bad(String detail) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,detail); }
    static ResponseStatusException conflict(String detail) { return new ResponseStatusException(HttpStatus.CONFLICT,detail); }
    static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"Catalog record not found"); }
    static String text(String value, int max, boolean required, String field) {
        String cleaned=value==null ? null : value.strip();
        if (cleaned!=null && cleaned.isEmpty()) cleaned=null;
        if ((required && cleaned==null) || (cleaned!=null && (cleaned.length()>max || cleaned.indexOf(0)>=0)))
            throw bad(field+" must "+(required ? "contain 1-" : "not exceed ")+max+" characters");
        return cleaned;
    }
    @Transactional(readOnly=true)
    public Summary summary(UUID user, UUID business) {
        authorize(user,business,false);
        var counts=items.counts(business);
        return new Summary(counts.getTotal(),categories.countByBusinessIdAndArchivedFalse(business),
                suppliers.countByBusinessIdAndArchivedFalse(business),counts.getProducts(),counts.getIngredients(),
                items.findTop6ByBusinessIdAndArchivedFalseOrderByUpdatedAtDescIdAsc(business).stream().map(CatalogDtos::view).toList());
    }
    @Transactional(readOnly=true)
    public ItemPage list(UUID user, UUID business, String q, String type, UUID category, String status, int page, int size, String stockStatus, UUID location) {
        authorize(user,business,false);
        if (page<0 || size<1 || size>100 || page>100000) throw bad("Invalid page or size (1-100)");
        Boolean archived=switch(status) { case "active" -> false; case "archived" -> true; case "all" -> null; default -> throw bad("Invalid status"); };
        if (type!=null && !Set.of("PRODUCT","INGREDIENT").contains(type)) throw bad("Invalid item type");
        String query=text(q,200,false,"Search");
        var pageable=PageRequest.of(page,size,Sort.by("name").and(Sort.by("id")));
        var result=stockStatus==null ? items.search(business,archived,type,category,query==null ? "" : query.toLowerCase(Locale.ROOT),pageable)
            : items.searchAlerts(business,archived,type,category,query==null ? "" : query.toLowerCase(Locale.ROOT),location,stockStatus,pageable);
        return new ItemPage(result.stream().map(CatalogDtos::view).toList(),result.getTotalElements(),page,size);
    }
    @Transactional(readOnly=true)
    public ItemView item(UUID user, UUID business, UUID id) {
        authorize(user,business,false); return view(items.findByBusinessIdAndId(business,id).orElseThrow(CatalogService::missing));
    }
    public ItemView saveItem(UUID user, UUID business, UUID id, ItemInput input) {
        authorize(user,business,true);
        StockItem item=id==null ? new StockItem(business) : items.lock(business,id).orElseThrow(CatalogService::missing);
        if (item.archived) throw conflict("Archived items cannot be edited");
        prepareItem(business,item,input);
        return view(items.saveAndFlush(item));
    }
    void prepareItem(UUID business, StockItem item, ItemInput input) {
        item.name=text(input.name(),200,true,"Name"); item.description=text(input.description(),2000,false,"Description");
        item.sku=text(input.sku(),100,false,"SKU"); item.skuKey=item.sku==null ? null : item.sku.toLowerCase(Locale.ROOT);
        item.barcode=text(input.barcode(),100,false,"Barcode");
        if (item.skuKey!=null && items.existsByBusinessIdAndSkuKeyAndIdNot(business,item.skuKey,item.id)) throw conflict("SKU already exists in this business");
        if (item.barcode!=null && items.existsByBusinessIdAndBarcodeAndIdNot(business,item.barcode,item.id)) throw conflict("Barcode already exists in this business");
        if (!Set.of("PRODUCT","INGREDIENT").contains(Objects.toString(input.itemType(),""))) throw bad("Item type must be PRODUCT or INGREDIENT");
        if (input.unit()==null) throw bad("Unit is required");
        if (item.unit!=null && item.unit!=input.unit() && (movements.existsByBusinessIdAndItemId(business,item.id) || thresholds.existsByBusinessIdAndItemId(business,item.id))) throw conflict("Unit cannot be changed while stock or a threshold exists");
        if (input.categoryId()!=null && categories.lock(business,input.categoryId()).filter(c -> !c.archived).isEmpty()) throw bad("Category must be active and belong to this business");
        if (input.supplierId()!=null && suppliers.lock(business,input.supplierId()).filter(s -> !s.archived).isEmpty()) throw bad("Supplier must be active and belong to this business");
        item.itemType=input.itemType(); item.unit=input.unit(); item.categoryId=input.categoryId(); item.supplierId=input.supplierId();
        item.updatedAt=Instant.now();
    }
    public void archiveItem(UUID user, UUID business, UUID id) {
        authorize(user,business,true); var item=items.lock(business,id).orElseThrow(CatalogService::missing);
        if (!item.archived) { item.archived=true; item.updatedAt=Instant.now(); }
    }
    @Transactional(readOnly=true)
    public List<CategoryView> categories(UUID user, UUID business) {
        authorize(user,business,false); return categories.findByBusinessIdOrderByNameAsc(business).stream().map(CatalogDtos::view).toList();
    }
    public CategoryView saveCategory(UUID user, UUID business, UUID id, CategoryInput input) {
        authorize(user,business,true); var c=id==null ? new Category(business) : categories.lock(business,id).orElseThrow(CatalogService::missing);
        if(c.archived) throw conflict("Archived categories cannot be edited");
        c.name=text(input.name(),200,true,"Name"); c.nameKey=c.name.toLowerCase(Locale.ROOT);
        if(categories.existsByBusinessIdAndNameKeyAndIdNot(business,c.nameKey,c.id)) throw conflict("Category name already exists in this business");
        c.updatedAt=Instant.now(); return view(categories.saveAndFlush(c));
    }
    public void archiveCategory(UUID user, UUID business, UUID id) {
        authorize(user,business,true); var c=categories.lock(business,id).orElseThrow(CatalogService::missing);
        if(!c.archived) { c.archived=true; c.updatedAt=Instant.now(); }
    }
    @Transactional(readOnly=true)
    public List<SupplierView> suppliers(UUID user, UUID business) {
        authorize(user,business,false); return suppliers.findByBusinessIdOrderByNameAsc(business).stream().map(CatalogDtos::view).toList();
    }
    public SupplierView saveSupplier(UUID user, UUID business, UUID id, SupplierInput input) {
        authorize(user,business,true); var s=id==null ? new Supplier(business) : suppliers.lock(business,id).orElseThrow(CatalogService::missing);
        if(s.archived) throw conflict("Archived suppliers cannot be edited");
        s.name=text(input.name(),200,true,"Name"); s.contactPerson=text(input.contactPerson(),200,false,"Contact person");
        s.email=text(input.email(),254,false,"Email");
        if(s.email!=null && !s.email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw bad("Invalid email address");
        s.phone=text(input.phone(),50,false,"Phone"); s.address=text(input.address(),1000,false,"Address"); s.notes=text(input.notes(),2000,false,"Notes");
        s.updatedAt=Instant.now(); return view(suppliers.saveAndFlush(s));
    }
    public void archiveSupplier(UUID user, UUID business, UUID id) {
        authorize(user,business,true); var s=suppliers.lock(business,id).orElseThrow(CatalogService::missing);
        if(!s.archived) { s.archived=true; s.updatedAt=Instant.now(); }
    }
}
