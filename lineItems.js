import { LightningElement, api, wire, track } from 'lwc';
import getLineItems     from '@salesforce/apex/SalesInvoiceLineItemController.getLineItems';
import getFieldSetFields from '@salesforce/apex/SalesInvoiceLineItemController.getFieldSetFields';

// ============================================================
// FIELD METADATA MAP
// Defines label, render type, link keys, and total key
// for every known field this component can display.
// Fields NOT in this map fall back to plain text rendering.
// ============================================================
const FIELD_META = {
    'c2g__Product__c':             { label: 'Product',            type: 'link',   hrefKey: 'productUrl',   displayKey: 'productName' },
    'c2g__UnitPrice__c':           { label: 'Unit Price',         type: 'number', totalKey: 'totalUnitPrice'                          },
    'c2g__Quantity__c':            { label: 'Quantity',           type: 'number', totalKey: 'totalQty'                                },
    'c2g__NetValue__c':            { label: 'Net Value',          type: 'number', totalKey: 'totalNet'                                },
    'c2g__Dimension1__c':          { label: 'Dimension 1',        type: 'link',   hrefKey: 'dim1Url',      displayKey: 'dim1'        },
    'c2g__Dimension2__c':          { label: 'Dimension 2',        type: 'link',   hrefKey: 'dim2Url',      displayKey: 'dim2'        },
    'c2g__Dimension4__c':          { label: 'Dimension 4',        type: 'link',   hrefKey: 'dim4Url',      displayKey: 'dim4'        },
    'Milestone__c':                { label: 'Milestone',          type: 'link',   hrefKey: 'milestoneUrl', displayKey: 'milestone'   },
    'c2g__LineDescription__c':     { label: 'Line Description',   type: 'text'                                                       },
    'c2g__TaxCode1__c':            { label: 'Tax Code',           type: 'text',                            displayKey: 'taxCode'     },
    'c2g__TaxRate1__c':            { label: 'Tax Rate',           type: 'number', totalKey: 'totalTaxRate'                           },
    'c2g__TaxValue1__c':           { label: 'Tax Value',          type: 'number', totalKey: 'totalTaxValue'                          },
    'ffpsai__BillingEventItem__c': { label: 'Billing Event Item', type: 'text',                            displayKey: 'billingItem' }
};

export default class LineItemsPanel extends LightningElement {

    @api recordId;

    // ── Three tracked arrays that drive the HTML ──────────────
    @track columnDefs = [];   // header row  → {label, colIndex, ...}
    @track tableData  = [];   // data rows   → {id, cells: [...]}
    @track totalCells = [];   // totals row  → {key, hasTotal, isLabel, value}

    // ── Raw cache from wires ──────────────────────────────────
    _rawFields = null;
    _rawItems  = null;

    // ── Internal totals object ────────────────────────────────
    _totals = { totalUnitPrice: 0, totalQty: 0, totalNet: 0, totalTaxRate: 0, totalTaxValue: 0 };

    // ── Resize state ──────────────────────────────────────────
    _isResizing      = false;
    _startX          = 0;
    _startWidth      = 0;
    _activeColIndex  = null;
    _cols            = null;
    _boundMouseMove  = null;
    _boundMouseUp    = null;
    _resizeReady     = false;

    // ============================================================
    // WIRE 1 — Dynamic field set column list
    // ============================================================
    @wire(getFieldSetFields)
    wiredFields({ data, error }) {
        if (data) {
            this._rawFields = data;
            this._refresh();
        } else if (error) {
            console.error('Error fetching field set fields:', error);
        }
    }

    // ============================================================
    // WIRE 2 — Line items (plain List<SObject>)
    // ============================================================
    @wire(getLineItems, { invoiceId: '$recordId' })
    wiredData({ data, error }) {
        if (data) {
            console.log('Raw data from Apex:', JSON.stringify(data));
            this._rawItems = data;
            this._refresh();
        } else if (error) {
            console.error('Error fetching line items:', error);
        }
    }

    // ============================================================
    // _refresh — called by both wires.
    // Waits until BOTH have resolved, then builds all three
    // tracked arrays in one shot so the HTML re-renders once.
    // ============================================================
    _refresh() {
        if (!this._rawFields || !this._rawItems) return;

        // 1 — Build column definitions
        this.columnDefs = this._buildColumnDefs(this._rawFields);

        // 2 — Enrich raw items (add computed helper props for links)
        const rows = this._rawItems.map((row, idx) => ({
            ...row,
            serialNumber: idx + 1,
            url:          '/' + row.Id,
            productUrl:   row.c2g__Product__c   ? '/' + row.c2g__Product__c   : null,
            productName:  row.c2g__Product__r?.Name,
            dim1Url:      row.c2g__Dimension1__c ? '/' + row.c2g__Dimension1__c : null,
            dim1:         row.c2g__Dimension1__r?.Name,
            dim2Url:      row.c2g__Dimension2__c ? '/' + row.c2g__Dimension2__c : null,
            dim2:         row.c2g__Dimension2__r?.Name,
            dim4Url:      row.c2g__Dimension4__c ? '/' + row.c2g__Dimension4__c : null,
            dim4:         row.c2g__Dimension4__r?.Name,
            milestoneUrl: row.Milestone__c        ? '/' + row.Milestone__c        : null,
            milestone:    row.Milestone__r?.Name,
            taxCode:      row.c2g__TaxCode1__r?.Name,
            billingItem:  row.ffpsai__BillingEventItem__r?.Name
        }));

        // 3 — Compute totals in JS from the items
        this._totals = {
            totalUnitPrice: rows.reduce((s, r) => s + (r.c2g__UnitPrice__c  || 0), 0),
            totalQty:       rows.reduce((s, r) => s + (r.c2g__Quantity__c   || 0), 0),
            totalNet:       rows.reduce((s, r) => s + (r.c2g__NetValue__c   || 0), 0),
            totalTaxRate:   rows.reduce((s, r) => s + (r.c2g__TaxRate1__c   || 0), 0),
            totalTaxValue:  rows.reduce((s, r) => s + (r.c2g__TaxValue1__c  || 0), 0)
        };

        // 4 — Build table rows: each row has a pre-resolved cells array
        this.tableData = rows.map(row => ({
            id:    row.Id,
            cells: this._buildRowCells(row, this.columnDefs)
        }));

        // 5 — Build totals row cells
        this.totalCells = this._buildTotalCells(this.columnDefs);

        // Reset resize so renderedCallback re-attaches on the new cols
        this._resizeReady = false;
    }

    // ============================================================
    // _buildColumnDefs
    // Always-first: # and Line Item ID
    // Then: one col per field set field
    // ============================================================
    _buildColumnDefs(fieldSetFields) {
        const cols = [
            { label: '#',            apiName: 'serialNumber', colIndex: 0, type: 'text', hasTotal: false, hrefKey: null, displayKey: null, totalKey: null },
            { label: 'Line Item ID', apiName: 'Name',         colIndex: 1, type: 'link', hasTotal: false, hrefKey: 'url', displayKey: null, totalKey: null }
        ];

        fieldSetFields.forEach((apiName, i) => {
            const meta = FIELD_META[apiName] || {};
            cols.push({
                label:      meta.label      || this._apiToLabel(apiName),
                apiName,
                colIndex:   i + 2,
                type:       meta.type       || 'text',
                hrefKey:    meta.hrefKey    || null,
                displayKey: meta.displayKey || null,
                totalKey:   meta.totalKey   || null,
                hasTotal:   !!meta.totalKey
            });
        });

        return cols;
    }

    // ============================================================
    // _buildRowCells
    // For each column returns {key, isLink, href, display}
    // ============================================================
    _buildRowCells(row, cols) {
        return cols.map(col => {
            if (col.type === 'link') {
                const href    = col.hrefKey    ? row[col.hrefKey]    : null;
                const display = col.displayKey ? row[col.displayKey] : row[col.apiName];
                return { key: col.colIndex, isLink: !!href, href, display: display ?? '-' };
            }
            const val = row[col.apiName];
            return { key: col.colIndex, isLink: false, href: null, display: val != null ? val : '-' };
        });
    }

    // ============================================================
    // _buildTotalCells
    // idx 0 → empty, idx 1 → "Subtotals" label, rest → value if hasTotal
    // ============================================================
    _buildTotalCells(cols) {
        return cols.map((col, idx) => ({
            key:      col.colIndex,
            isLabel:  idx === 1,
            hasTotal: col.hasTotal,
            value:    col.hasTotal ? (this._totals[col.totalKey] || 0) : ''
        }));
    }

    // ============================================================
    // HELPER — API name → human label fallback
    // ============================================================
    _apiToLabel(apiName) {
        return apiName
            .replace(/^c2g__/, '')
            .replace(/__c$/, '')
            .replace(/([A-Z])/g, ' $1')
            .trim();
    }

    // ============================================================
    // GETTER
    // ============================================================
    get totalLineItems() {
        return this.tableData ? this.tableData.length : 0;
    }

    // ============================================================
    // LIFECYCLE — attach resize listeners after columns render
    // Always re-query _cols so reference stays current
    // ============================================================
    renderedCallback() {
        this._cols = this.template.querySelectorAll('col');

        if (this._resizeReady || this._cols.length === 0) return;

        const resizers = this.template.querySelectorAll('.col-resizer');
        if (resizers.length === 0) return;

        this._resizeReady    = true;
        this._boundMouseMove = this.onMouseMove.bind(this);
        this._boundMouseUp   = this.onMouseUp.bind(this);

        resizers.forEach(r => r.addEventListener('mousedown', e => this.onMouseDown(e)));
    }

    // ============================================================
    // RESIZE HANDLERS
    // ============================================================
    onMouseDown(e) {
        e.preventDefault();
        this._activeColIndex = parseInt(e.target.dataset.colIndex, 10);
        this._startX         = e.clientX;
        const col            = this._cols[this._activeColIndex];
        this._startWidth     = col.offsetWidth || parseInt(col.style.width, 10);
        this._isResizing     = true;
        e.target.classList.add('resizing');
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', this._boundMouseMove);
        document.addEventListener('mouseup',   this._boundMouseUp);
    }

    onMouseMove(e) {
        if (!this._isResizing) return;
        let newWidth = this._startWidth + (e.clientX - this._startX);
        if (newWidth < 40) newWidth = 40;
        this._cols[this._activeColIndex].style.width = newWidth + 'px';
    }

    onMouseUp() {
        if (!this._isResizing) return;
        this._isResizing     = false;
        this._activeColIndex = null;
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        this.template.querySelectorAll('.col-resizer').forEach(r => r.classList.remove('resizing'));
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup',   this._boundMouseUp);
    }

    disconnectedCallback() {
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup',   this._boundMouseUp);
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
    }
}