import { LightningElement, api, wire, track } from 'lwc';
import getLineItems from '@salesforce/apex/SalesInvoiceLineItemController.getLineItems';
import getFieldSetFields from '@salesforce/apex/SalesInvoiceLineItemController.getFieldSetFields';

export default class LineItemsPanel extends LightningElement {

    @api recordId;

    @track data = [];
    @track columns = [];  // dynamic columns from field set

    totals = {
        totalUnitPrice: 0,
        totalQty: 0,
        totalNet: 0,
        totalTaxRate: 0,
        totalTaxValue: 0
    };

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
    // WIRE - FETCH DYNAMIC FIELD SET COLUMNS
    // Same pattern as summary.js - import field set fields
    // so columns are driven dynamically, not hardcoded
    // ==========================================
    @wire(getFieldSetFields)
    wiredFields({ data, error }) {
        if (data) {
            this.columns = data;  // dynamic list of field API names from field set
        } else if (error) {
            console.error('Error fetching field set fields:', error);
        }
    }

    // ==========================================
    // WIRE - FETCH LINE ITEMS
    // Controller now returns plain List<SObject>
    // so we access data directly (not data.items)
    // ==========================================
    @wire(getLineItems, { invoiceId: '$recordId' })
    wiredData({ data, error }) {
        if (data) {
            console.log('Raw data from Apex:', JSON.stringify(data));

            this.data = data.map((row, index) => ({
                ...row,
                serialNumber: index + 1,
                url: '/' + row.Id,
                productUrl: row.c2g__Product__c ? '/' + row.c2g__Product__c : null,
                productName: row.c2g__Product__r?.Name,
                dim1Url: row.c2g__Dimension1__c ? '/' + row.c2g__Dimension1__c : null,
                dim1: row.c2g__Dimension1__r?.Name,
                dim2Url: row.c2g__Dimension2__c ? '/' + row.c2g__Dimension2__c : null,
                dim2: row.c2g__Dimension2__r?.Name,
                dim4Url: row.c2g__Dimension4__c ? '/' + row.c2g__Dimension4__c : null,
                dim4: row.c2g__Dimension4__r?.Name,
                milestoneUrl: row.Milestone__c ? '/' + row.Milestone__c : null,
                milestone: row.Milestone__r?.Name,
                taxCode: row.c2g__TaxCode1__r?.Name,
                billingItem: row.ffpsai__BillingEventItem__r?.Name
            }));

            // 🔹 Totals computed directly in JS (not from controller)
            // Controller only returns the raw items list now
            this.totals = {
                totalUnitPrice: this.data.reduce((sum, row) => sum + (row.c2g__UnitPrice__c  || 0), 0),
                totalQty:       this.data.reduce((sum, row) => sum + (row.c2g__Quantity__c   || 0), 0),
                totalNet:       this.data.reduce((sum, row) => sum + (row.c2g__NetValue__c   || 0), 0),
                totalTaxRate:   0,
                totalTaxValue:  this.data.reduce((sum, row) => sum + (row.c2g__TaxValue1__c  || 0), 0)
            };

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
    // GETTER
    // ==========================================
    get totalLineItems() {
        return this.data ? this.data.length : 0;
    }
}