import { LightningElement, api, wire, track } from 'lwc';
import getLineItems from '@salesforce/apex/SalesInvoiceLineItemController.getLineItems';

export default class LineItemsPanel extends LightningElement {

    @api recordId;

    @track columnDefs = [];
    @track tableData  = [];
    @track totalCells = [];

    _totals      = {};
    _isResizing  = false;
    _startX      = 0;
    _startWidth  = 0;
    _activeColIndex = null;
    _cols           = null;
    _boundMouseMove = null;
    _boundMouseUp   = null;
    _resizeReady    = false;

    // ============================================================
    // WIRE — only getLineItems. Columns are derived from the
    // keys that come back in the data — no hardcoded list.
    // ============================================================
    @wire(getLineItems, { invoiceId: '$recordId' })
    wiredData({ data, error }) {
        if (data) {
            console.log('Raw data from Apex:', JSON.stringify(data));
            this._processData(data);
        } else if (error) {
            console.error('Error fetching line items:', error);
        }
    }

    // ============================================================
    // _processData — builds everything from the raw Apex list
    // ============================================================
    _processData(rawData) {
        if (!rawData || rawData.length === 0) {
            this.columnDefs = [];
            this.tableData  = [];
            this.totalCells = [];
            return;
        }

        const sampleRow = rawData[0];

        // ── Step 1: find which __c fields have relationship data
        //   across ALL records (not just the first one), so a lookup
        //   field whose first record is empty still gets link rendering.
        const relFields = new Set();
        rawData.forEach(row => {
            Object.keys(row).forEach(k => {
                if (k.endsWith('__r') && row[k] !== null && typeof row[k] === 'object') {
                    relFields.add(k.replace('__r', '__c'));
                }
            });
        });

        // ── Step 2: scalar field keys from the first record.
        //   Skip: Salesforce 'attributes', 'Id' (used for URL only),
        //   'Name' (handled as fixed col), and nested relationship objects.
        const fieldKeys = Object.keys(sampleRow).filter(k => {
            if (['attributes', 'Id', 'Name'].includes(k)) return false;
            const v = sampleRow[k];
            return v === null || typeof v !== 'object';
        });

        // ── Step 3: build column definitions
        const dynamicCols = fieldKeys.map((apiName, i) =>
            this._getFieldMeta(apiName, sampleRow[apiName], i + 2, relFields)
        );

        this.columnDefs = [
            { label: '#',            apiName: 'serialNumber', colIndex: 0, type: 'text', hasTotal: false, hrefKey: null,  displayKey: null,  totalKey: null },
            { label: 'Line Item ID', apiName: 'Name',         colIndex: 1, type: 'link', hasTotal: false, hrefKey: 'url', displayKey: null,  totalKey: null },
            ...dynamicCols
        ];

        // ── Step 4: enrich each row — add serialNumber, url,
        //   and for every lookup field auto-generate _url / _name helpers.
        const enrichedRows = rawData.map((row, idx) => {
            const enriched = { ...row, serialNumber: idx + 1, url: '/' + row.Id };
            fieldKeys.forEach(apiName => {
                const relKey = apiName.endsWith('__c') ? apiName.replace('__c', '__r') : null;
                if (relKey) {
                    const relObj = row[relKey];
                    enriched[apiName + '_url']  = row[apiName] ? '/' + row[apiName] : null;
                    enriched[apiName + '_name'] = relObj ? (relObj.Name ?? null) : null;
                }
            });
            return enriched;
        });

        // ── Step 5: compute totals for every numeric column
        this._totals = {};
        this.columnDefs.forEach(col => {
            if (col.totalKey) {
                this._totals[col.totalKey] = enrichedRows.reduce(
                    (sum, row) => sum + (row[col.apiName] || 0), 0
                );
            }
        });

        // ── Step 6: pre-resolve cells for each row
        this.tableData = enrichedRows.map(row => ({
            id:    row.Id,
            cells: this._buildRowCells(row, this.columnDefs)
        }));

        // ── Step 7: build totals row
        this.totalCells = this._buildTotalCells(this.columnDefs);

        // Reset so renderedCallback re-attaches resize listeners
        this._resizeReady = false;
    }

    // ============================================================
    // _getFieldMeta — auto-detects label, type, and total key
    // from the API name and actual data. Works for any new field
    // added to the field set without touching this JS file.
    // ============================================================
    _getFieldMeta(apiName, sampleVal, colIndex, relFields) {
        const label = this._apiToLabel(apiName);

        let type       = 'text';
        let hrefKey    = null;
        let displayKey = null;
        let totalKey   = null;

        if (relFields.has(apiName)) {
            // Lookup field — at least one record has relationship data
            type       = 'link';
            hrefKey    = apiName + '_url';
            displayKey = apiName + '_name';
        } else if (typeof sampleVal === 'number') {
            // Numeric field — sum it in the totals row
            type     = 'number';
            totalKey = 'total_' + apiName;
        }
        // else: plain text — no totals, no link

        return { label, apiName, colIndex, type, hasTotal: !!totalKey, hrefKey, displayKey, totalKey };
    }

    // ============================================================
    // _buildRowCells — one {key, isLink, href, display} per col
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
    // _buildTotalCells — col 0: blank, col 1: "Subtotals" label,
    // rest: value if numeric, blank otherwise
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
    // _apiToLabel — namespace-aware API name → readable label
    // Works for c2g__, ffpsai__, and any other namespace prefix
    // ============================================================
    _apiToLabel(apiName) {
        return apiName
            .replace(/^[a-z0-9]+__/i, '')   // remove namespace prefix
            .replace(/__c$/, '')             // remove __c suffix
            .replace(/([A-Z])/g, ' $1')     // CamelCase → words
            .trim();
    }

    get totalLineItems() {
        return this.tableData ? this.tableData.length : 0;
    }

    // ============================================================
    // LIFECYCLE — resize
    // Always re-query _cols (colgroup is dynamic, changes on refresh)
    // Only attach listeners once per render cycle
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