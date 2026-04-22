public with sharing class SalesInvoiceSummaryController {

    @AuraEnabled(cacheable=true)
    public static List<String> getFieldSetFields() {

        List<String> fields = new List<String>();

        // 🔹 Fetch fields from Field Set
        for (Schema.FieldSetMember f :
            Schema.SObjectType.c2g__codaInvoice__c.FieldSets.Summary_Fields.getFields()) {

            fields.add(f.getFieldPath());
        }

        return fields;
    }
}