import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import getFieldSetFields from '@salesforce/apex/SalesInvoiceSummaryController.getFieldSetFields';

export default class InvoiceSummary extends LightningElement {
    @api recordId;
    fieldData = [];
    _fields = [];
    _record = null;

    @wire(getFieldSetFields)
    wiredFields({ data }) {
        if (data) {
            this._fields = data.map(f => `c2g__codaInvoice__c.${f}`);
            this._refreshFieldData();
        }
    }

    @wire(getRecord, { recordId: '$recordId', fields: '$_fields' })
    wiredRecord({ data }) {
        if (data) {
            this._record = data;
            this._refreshFieldData();
        }
    }

    _refreshFieldData() {
        if (!this._record || !this._fields.length) return;

        this.fieldData = this._fields.map(fullField => {
            const apiName = fullField.split('.')[1];
            const fieldObj = this._record.fields[apiName];
            return {
                apiName,
                label: fieldObj ? this._getLabel(apiName) : apiName,
                value: fieldObj ? this._formatValue(fieldObj) : '-'
            };
        });
    }

    _formatValue(fieldObj) {
        if (fieldObj.value === null || fieldObj.value === undefined) return '-';
        // Format numbers with commas
        if (typeof fieldObj.value === 'number') {
            return 'USD ' + new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(fieldObj.value);
        }
        return fieldObj.displayValue || fieldObj.value;
    }

    _getLabel(apiName) {
        // Format API name to readable label
        return apiName
            .replace('c2g__', '')
            .replace('__c', '')
            .replace(/([A-Z])/g, ' $1')
            .trim();
    }
}
