public with sharing class SalesInvoiceLineItemController {

    @AuraEnabled(cacheable=true)
    public static LineItemResponse getLineItems(Id invoiceId){
        // Get FieldSet to determine which columns to display
        List<Schema.FieldSetMember> fieldSetMembers = Schema.SObjectType.c2g__codaInvoiceLineItem__c.FieldSets.LineItem_Fields.getFields();
        
        // Build dynamic SOQL SELECT clause
        Set<String> fieldsToQuery = new Set<String>();
        List<ColumnMetadata> columns = new List<ColumnMetadata>();
        
        // Always include Id and Name
        fieldsToQuery.add('Id');
        fieldsToQuery.add('Name');
        
        // Add fields from FieldSet and create column metadata
        for (Schema.FieldSetMember f : fieldSetMembers) {
            fieldsToQuery.add(f.getFieldPath());
            
            ColumnMetadata col = new ColumnMetadata();
            col.apiName = f.getFieldPath();
            col.label = f.getLabel();
            col.type = String.valueOf(f.getType());
            col.isSummable = (f.getType() == Schema.DisplayType.DOUBLE || 
                             f.getType() == Schema.DisplayType.INTEGER ||
                             f.getType() == Schema.DisplayType.CURRENCY ||
                             f.getType() == Schema.DisplayType.PERCENT);
            col.isReference = (f.getType() == Schema.DisplayType.REFERENCE);
            
            columns.add(col);
        }
        
        // Add related object fields for display names and links
        Set<String> relatedFields = new Set<String>();
        relatedFields.add('c2g__Product__c');
        relatedFields.add('c2g__Product__r.Name');
        relatedFields.add('c2g__Dimension1__c');
        relatedFields.add('c2g__Dimension1__r.Name');
        relatedFields.add('c2g__Dimension2__c');
        relatedFields.add('c2g__Dimension2__r.Name');
        relatedFields.add('c2g__Dimension4__c');
        relatedFields.add('c2g__Dimension4__r.Name');
        relatedFields.add('Milestone__c');
        relatedFields.add('Milestone__r.Name');
        relatedFields.add('c2g__TaxCode1__r.Name');
        relatedFields.add('ffpsai__BillingEventItem__r.Name');
        fieldsToQuery.addAll(relatedFields);
        
        // Convert to List for query
        List<String> fieldList = new List<String>(fieldsToQuery);
        String queryString = 'SELECT ' + String.join(fieldList, ', ') + ' FROM c2g__codaInvoiceLineItem__c WHERE c2g__Invoice__c = :invoiceId';
        
        List<c2g__codaInvoiceLineItem__c> items = Database.query(queryString);
        
        // Calculate totals for summable columns only
        Map<String, Decimal> totals = new Map<String, Decimal>();
        for (ColumnMetadata col : columns) {
            if (col.isSummable) {
                totals.put(col.apiName, 0);
            }
        }
        
        for(c2g__codaInvoiceLineItem__c item : items){
            for (String fieldName : totals.keySet()) {
                Object val = item.get(fieldName);
                if (val != null) {
                    totals.put(fieldName, totals.get(fieldName) + (Decimal)val);
                }
            }
        }

        return new LineItemResponse(items, columns, totals);
    }

    public class ColumnMetadata {
        @AuraEnabled public String apiName;
        @AuraEnabled public String label;
        @AuraEnabled public String type;
        @AuraEnabled public Boolean isSummable;
        @AuraEnabled public Boolean isReference;
    }

    public class LineItemResponse {
        @AuraEnabled public List<c2g__codaInvoiceLineItem__c> items;
        @AuraEnabled public List<ColumnMetadata> columns;
        @AuraEnabled public Map<String, Decimal> totals;

        public LineItemResponse(List<c2g__codaInvoiceLineItem__c> items,
                                List<ColumnMetadata> columns,
                                Map<String, Decimal> totals){
            this.items = items;
            this.columns = columns;
            this.totals = totals;
        }
    }
}