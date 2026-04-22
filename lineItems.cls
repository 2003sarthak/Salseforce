public with sharing class SalesInvoiceLineItemController {

    @AuraEnabled(cacheable=true)
    public static List<String> getFieldSetFields() {

        List<String> fields = new List<String>();

        // 🔹 Fetch fields from Field Set
        for (Schema.FieldSetMember f :
            Schema.SObjectType.c2g__codaInvoiceLineItem__c.FieldSets.c2g__ManageLinesSUT.getFields()) {

            fields.add(f.getFieldPath());
        }

        return fields;
    }

    @AuraEnabled(cacheable=true)
    public static List<c2g__codaInvoiceLineItem__c> getLineItems(Id invoiceId) {

        // 🔹 Build dynamic field set
        Set<String> fieldSet = new Set<String>();

        // Always include Id
        fieldSet.add('Id');

        // 🔹 Add fields required for totals (computed in JS)
        fieldSet.add('c2g__UnitPrice__c');
        fieldSet.add('c2g__Quantity__c');
        fieldSet.add('c2g__NetValue__c');
        fieldSet.add('c2g__TaxValue1__c');
        fieldSet.add('c2g__TaxRate1__c');  // 🔹 needed for per-row display & totalTaxRate in JS

        // 🔹 Add fields from Field Set dynamically
        for (Schema.FieldSetMember f :
            Schema.SObjectType.c2g__codaInvoiceLineItem__c.FieldSets.c2g__ManageLinesSUT.getFields()) {
            fieldSet.add(f.getFieldPath());
        }

        // 🔹 Build SOQL query dynamically
        String query = 'SELECT ' + String.join(new List<String>(fieldSet), ', ') +
                       ' FROM c2g__codaInvoiceLineItem__c' +
                       ' WHERE c2g__Invoice__c = :invoiceId';

        return Database.query(query);
    }
}
