import { LightningElement, api, wire, track } from 'lwc';
import getLineItems from '@salesforce/apex/SalesInvoiceLineItemController.getLineItems';

export default class LineItemsPanel extends LightningElement {

    @api recordId;

    @track data = [];
    @track columns = [];

    totals = {};

    // ==========================================
    // COLUMN RESIZE PROPERTIES
    // ==========================================
    _isResizing       = false;   // drag in progress flag
    _startX           = 0;       // mouse X when drag started
    _startWidth       = 0;       // column width when drag started
    _activeColIndex   = null;    // which column is being dragged
    _cols             = null;    // reference to <col> elements

    // Bound versions of handlers
    // needed so we can removeEventListener later
    _boundMouseMove   = null;
    _boundMouseUp     = null;

    // ==========================================
    // WIRE - FETCH DATA
    // ==========================================
    @wire(getLineItems, { invoiceId: '$recordId' })
    wiredData({ data, error }) {
        if (data) {
            // Store columns metadata
            this.columns = data.columns;

            // Transform rows - add computed fields for URLs and display values
            this.data = data.items.map((row, index) => {
                let transformedRow = {
                    ...row,
                    serialNumber: index + 1,
                    url: '/' + row.Id
                };

                // Add URL and display name fields for common reference fields
                // This preserves the link functionality
                transformedRow.productUrl = row.c2g__Product__c ? '/' + row.c2g__Product__c : null;
                transformedRow.productName = row.c2g__Product__r?.Name;
                
                transformedRow.dim1Url = row.c2g__Dimension1__c ? '/' + row.c2g__Dimension1__c : null;
                transformedRow.dim1 = row.c2g__Dimension1__r?.Name;
                
                transformedRow.dim2Url = row.c2g__Dimension2__c ? '/' + row.c2g__Dimension2__c : null;
                transformedRow.dim2 = row.c2g__Dimension2__r?.Name;
                
                transformedRow.dim4Url = row.c2g__Dimension4__c ? '/' + row.c2g__Dimension4__c : null;
                transformedRow.dim4 = row.c2g__Dimension4__r?.Name;
                
                transformedRow.milestoneUrl = row.Milestone__c ? '/' + row.Milestone__c : null;
                transformedRow.milestone = row.Milestone__r?.Name;
                
                transformedRow.taxCode = row.c2g__TaxCode1__r?.Name;
                transformedRow.billingItem = row.ffpsai__BillingEventItem__r?.Name;

                return transformedRow;
            });

            // Populate totals object from response
            this.totals = data.totals || {};

        } else if (error) {
            console.error('Error fetching data:', error);
        }
    }

    // ==========================================
    // LIFECYCLE - SETUP RESIZE AFTER RENDER
    // ==========================================
    renderedCallback() {
        // renderedCallback fires every time component re-renders
        // We only want to attach resize listeners ONCE
        if (this._resizeInitialized) return;
        this._resizeInitialized = true;

        // Get all .col-resizer divs in the header
        const resizers = this.template.querySelectorAll('.col-resizer');

        // Get all <col> elements from <colgroup>
        this._cols = this.template.querySelectorAll('col');

        // Bind mouse move and mouse up once
        this._boundMouseMove = this.onMouseMove.bind(this);
        this._boundMouseUp   = this.onMouseUp.bind(this);

        // Attach mousedown to each resizer handle
        resizers.forEach(resizer => {
            resizer.addEventListener('mousedown', (e) => {
                this.onMouseDown(e);
            });
        });
    }

    // ==========================================
    // RESIZE - MOUSE DOWN
    // Triggered when user clicks on a resizer
    // ==========================================
    onMouseDown(e) {
        // Prevent text selection while dragging
        e.preventDefault();

        // Which column index is this resizer for
        this._activeColIndex = parseInt(e.target.dataset.colIndex, 10);

        // Record starting mouse X position
        this._startX = e.clientX;

        // Record starting column width
        const col = this._cols[this._activeColIndex];
        this._startWidth = col.offsetWidth || parseInt(col.style.width, 10);

        // Set dragging flag
        this._isResizing = true;

        // Add active class to resizer for visual feedback
        e.target.classList.add('resizing');

        // Add cursor style to body so it stays col-resize
        // even when mouse moves fast outside the resizer
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Listen on document for move and up
        // so drag works even outside the table
        document.addEventListener('mousemove', this._boundMouseMove);
        document.addEventListener('mouseup',   this._boundMouseUp);
    }

    // ==========================================
    // RESIZE - MOUSE MOVE
    // Triggered while dragging
    // ==========================================
    onMouseMove(e) {
        if (!this._isResizing) return;

        // How far has mouse moved from start
        const deltaX = e.clientX - this._startX;

        // New width = original width + delta
        let newWidth = this._startWidth + deltaX;

        // Enforce minimum column width of 40px
        if (newWidth < 40) newWidth = 40;

        // Apply new width to the <col> element
        this._cols[this._activeColIndex].style.width = newWidth + 'px';
    }

    // ==========================================
    // RESIZE - MOUSE UP
    // Triggered when user releases mouse
    // ==========================================
    onMouseUp() {
        if (!this._isResizing) return;

        // Reset dragging flag
        this._isResizing = false;
        this._activeColIndex = null;

        // Restore cursor and selection
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Remove active class from all resizers
        const resizers = this.template.querySelectorAll('.col-resizer');
        resizers.forEach(r => r.classList.remove('resizing'));

        // Remove document listeners - cleanup
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup',   this._boundMouseUp);
    }

    // ==========================================
    // LIFECYCLE - CLEANUP ON DESTROY
    // ==========================================
    disconnectedCallback() {
        // Safety cleanup if component is removed
        // while dragging is in progress
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup',   this._boundMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // ==========================================
    // GETTER - Get cell value dynamically
    // ==========================================
    getCellValue(row, apiName) {
        // Handle special computed fields for URLs and display names
        if (apiName === 'c2g__Product__r.Name') return row.productName;
        if (apiName === 'c2g__Dimension1__r.Name') return row.dim1;
        if (apiName === 'c2g__Dimension2__r.Name') return row.dim2;
        if (apiName === 'c2g__Dimension4__r.Name') return row.dim4;
        if (apiName === 'Milestone__r.Name') return row.milestone;
        if (apiName === 'c2g__TaxCode1__r.Name') return row.taxCode;
        if (apiName === 'ffpsai__BillingEventItem__r.Name') return row.billingItem;
        
        // For regular fields, get the value
        return row[apiName];
    }

    // ==========================================
    // GETTER - Get URL for reference fields
    // ==========================================
    getCellUrl(row, apiName) {
        if (apiName === 'c2g__Product__c') return row.productUrl;
        if (apiName === 'c2g__Dimension1__c') return row.dim1Url;
        if (apiName === 'c2g__Dimension2__c') return row.dim2Url;
        if (apiName === 'c2g__Dimension4__c') return row.dim4Url;
        if (apiName === 'Milestone__c') return row.milestoneUrl;
        return null;
    }

    // ==========================================
    // GETTER - Check if field is a reference that needs URL
    // ==========================================
    isReferenceField(apiName) {
        return ['c2g__Product__c', 'c2g__Dimension1__c', 'c2g__Dimension2__c', 
                'c2g__Dimension4__c', 'Milestone__c', 'Id', 'Name'].includes(apiName);
    }

    // ==========================================
    // GETTER
    // ==========================================
    get totalLineItems() {
        return this.data ? this.data.length : 0;
    }
}