let globalData = { cols: [], rows: [] };
        let activeFilters = [];
        let currentView = 'table';
        let currentGroupColId = null; 

        // --- 1. Parser ---
        function parseTable(rawData) {
            const colsMap = new Map();
            colsMap.set('page_title', { id: 'page_title', name: 'Título da Página', type: 'text' });

            const rows = rawData.reduce((acc, item) => {
                let pageCols = item.page_columns;
                if (typeof pageCols === 'string') {
                    try { pageCols = JSON.parse(pageCols); } catch (e) { pageCols = {}; }
                }

                const row = { id: item.page_id, page_title: item.page_title };

                if (pageCols && typeof pageCols === 'object') {
                    Object.entries(pageCols).forEach(([colId, colDef]) => {
                        if (!colsMap.has(colId)) {
                            let options = [];
                            if (colDef.column_type === 'select' && colDef.column_data) {
                                try {
                                    const colDataParsed = typeof colDef.column_data === 'string' ? JSON.parse(colDef.column_data) : colDef.column_data;
                                    options = colDataParsed.options || [];
                                } catch(e) {}
                            }
                            colsMap.set(colId, { id: colId, name: colDef.column_name, type: colDef.column_type, options: options });
                        }

                        let cellData = {};
                        if (typeof colDef.row_data === 'string') {
                            try { cellData = JSON.parse(colDef.row_data); } catch (e) { }
                        } else if (colDef.row_data) {
                            cellData = colDef.row_data;
                        }
                        row[colId] = cellData.value !== undefined ? cellData.value : null;
                    });
                }
                acc.push(row);
                return acc;
            }, []);

            return { cols: Array.from(colsMap.values()), rows: rows };
        }

        // Helpers de Formatação
        function formatForDateTimeLocal(isoString) {
            if (!isoString) return '';
            const d = new Date(isoString);
            const offset = d.getTimezoneOffset() * 60000; 
            return (new Date(d - offset)).toISOString().slice(0, 16);
        }
        function formatForDisplay(isoString) {
            if (!isoString) return '';
            const d = new Date(isoString);
            return d.toLocaleDateString('pt-BR');
        }

        // --- 2. Lógica do 'Group By' ---
        function initGroupSelector() {
            const selectElement = document.getElementById('groupby-select');
            const groupableCols = globalData.cols.filter(c => c.type === 'select' || c.type === 'checkbox');
            
            selectElement.innerHTML = groupableCols.map(col => 
                `<option value="${col.id}">${col.name}</option>`
            ).join('');

            if (groupableCols.length > 0) {
                currentGroupColId = groupableCols[0].id;
                selectElement.value = currentGroupColId;
                updateGroupLabel();
            }
        }

        function updateGroupLabel() {
            const col = globalData.cols.find(c => c.id === currentGroupColId);
            document.getElementById('current-group-label').textContent = col ? col.name : '';
        }

        // --- 3. Filtros ---
        function getFilterValueInputHtml(filterId, col) {
            if (!col) return '';
            const filter = activeFilters.find(f => f.id === filterId);
            const val = filter.value || '';

            if (col.type === 'select') {
                return `
                    <select class="filter-value-input" data-filter-id="${filterId}">
                        <option value="" disabled ${!val ? 'selected' : ''}>Selecione...</option>
                        ${col.options.map(o => `<option value="${o.id}" ${val === o.id ? 'selected' : ''}>${o.value}</option>`).join('')}
                    </select>
                `;
            }
            if (col.type === 'checkbox') {
                return `
                    <select class="filter-value-input" data-filter-id="${filterId}">
                        <option value="" disabled ${!val ? 'selected' : ''}>Selecione...</option>
                        <option value="true" ${String(val) === 'true' ? 'selected' : ''}>Sim</option>
                        <option value="false" ${String(val) === 'false' ? 'selected' : ''}>Não</option>
                    </select>
                `;
            }
            if (col.type === 'numeric') {
                return `<input type="number" class="filter-value-input" data-filter-id="${filterId}" value="${val}" placeholder="Número..." />`;
            }
            
            return `<input type="text" class="filter-value-input" data-filter-id="${filterId}" value="${val}" placeholder="Texto..." />`;
        }

        function renderFilterMenu() {
            const container = document.getElementById('filter-rules-container');
            const countSpan = document.getElementById('filter-count');
            
            countSpan.textContent = activeFilters.length > 0 ? `(${activeFilters.length})` : '';

            if (activeFilters.length === 0) {
                container.innerHTML = '<span style="font-size: 0.85rem; color:#8b949e;">Nenhum filtro aplicado.</span>';
                return;
            }

            container.innerHTML = activeFilters.map((filter, index) => {
                const selectedCol = globalData.cols.find(c => c.id === filter.colId);
                const isFirst = index === 0;

                let operatorOptions = `<option value="equals" ${filter.operator === 'equals' ? 'selected' : ''}>Igual</option>`;
                if (!selectedCol || selectedCol.type === 'text') {
                    operatorOptions += `<option value="contains" ${filter.operator === 'contains' ? 'selected' : ''}>Contém</option>`;
                }

                return `
                    <div class="filter-rule">
                        <span class="filter-label">${isFirst ? 'Onde' : 'And'}</span>
                        
                        <select class="filter-col-select" data-filter-id="${filter.id}" style="width:130px;">
                            <option value="" disabled ${!filter.colId ? 'selected' : ''}>Coluna...</option>
                            ${globalData.cols.filter(c => c.type !== 'date').map(col => 
                                `<option value="${col.id}" ${filter.colId === col.id ? 'selected' : ''}>${col.name}</option>`
                            ).join('')}
                        </select>

                        <select class="filter-operator-select" data-filter-id="${filter.id}" style="width:100px;">
                            ${operatorOptions}
                        </select>

                        ${getFilterValueInputHtml(filter.id, selectedCol)}

                        <button class="btn-remove-filter" data-filter-id="${filter.id}">×</button>
                    </div>
                `;
            }).join('');
        }

        // --- 4. Motor Principal de Renderização ---
        function applyFiltersAndRender() {
            let filteredRows = globalData.rows;

            if (activeFilters.length > 0) {
                filteredRows = globalData.rows.filter(row => {
                    return activeFilters.every(filter => {
                        if (!filter.colId || filter.value === null || filter.value === '') return true;

                        const cellValue = row[filter.colId];
                        const filterVal = filter.value;

                        if (filter.operator === 'equals') {
                            return String(cellValue).toLowerCase() === String(filterVal).toLowerCase();
                        } else if (filter.operator === 'contains') {
                            if (cellValue === null || cellValue === undefined) return false;
                            return String(cellValue).toLowerCase().includes(String(filterVal).toLowerCase());
                        }
                        return true;
                    });
                });
            }

            if (currentView === 'table') {
                renderTable(globalData.cols, filteredRows);
            } else {
                renderBoard(globalData.cols, filteredRows);
            }
        }

        // Visão: Tabela (Editável)
        function renderTable(cols, rows) {
            const headersRow = document.getElementById('table-headers');
            const tableBody = document.getElementById('table-body');

            headersRow.innerHTML = cols.map(col => `<th>${col.name}</th>`).join('');

            if (rows.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="100%" class="loading">Nenhum resultado encontrado.</td></tr>`;
                return;
            }

            tableBody.innerHTML = rows.map(row => {
                const cellsHtml = cols.map(col => {
                    const cellValue = row[col.id];
                    let displayValue = cellValue;

                    if (col.type === 'select') {
                        const selectedOption = col.options.find(opt => opt.id === cellValue);
                        const bgColorClass = selectedOption ? `color-${selectedOption.color}` : 'color-transparent';
                        const optionsHtml = col.options.map(opt => 
                            `<option value="${opt.id}" data-color="${opt.color}" ${opt.id === cellValue ? 'selected' : ''}>${opt.value}</option>`
                        ).join('');

                        displayValue = `
                            <select class="custom-select ${bgColorClass}" onchange="this.className = 'custom-select color-' + this.options[this.selectedIndex].getAttribute('data-color')">
                                <option value="" disabled ${!cellValue ? 'selected' : ''}>Selecione...</option>
                                ${optionsHtml}
                            </select>
                        `;
                    } 
                    else if (col.type === 'checkbox') {
                        displayValue = `<input type="checkbox" class="custom-checkbox" ${cellValue === true ? 'checked' : ''} />`;
                    } 
                    else if (col.type === 'date') {
                        displayValue = `<input type="datetime-local" class="custom-date" value="${formatForDateTimeLocal(cellValue)}" />`;
                    } 
                    else if (cellValue === null || cellValue === undefined) {
                        displayValue = '-';
                    }

                    return `<td class="type-${col.type}">${displayValue}</td>`;
                }).join('');

                return `<tr>${cellsHtml}</tr>`;
            }).join('');
        }

        // Visão: Quadro (Board/Kanban)
        function renderBoard(cols, rows) {
            const boardContainer = document.getElementById('view-board');
            const groupCol = cols.find(c => c.id === currentGroupColId);
            let boardColumns = [];

            if (groupCol) {
                if (groupCol.type === 'select') {
                    boardColumns = groupCol.options.map(opt => ({
                        title: opt.value, color: opt.color, items: rows.filter(r => r[groupCol.id] === opt.id)
                    }));
                } else if (groupCol.type === 'checkbox') {
                    boardColumns = [
                        { title: "✅ Sim", color: "green", items: rows.filter(r => r[groupCol.id] === true) },
                        { title: "❌ Não", color: "transparent", items: rows.filter(r => r[groupCol.id] !== true) }
                    ];
                }

                // Cria "Sem Grupo" para registros que não têm essa propriedade
                const emptyItems = rows.filter(r => r[groupCol.id] === null || r[groupCol.id] === undefined || r[groupCol.id] === '');
                if (emptyItems.length > 0 && groupCol.type !== 'checkbox') {
                    boardColumns.push({ title: "Sem Grupo", color: "transparent", items: emptyItems });
                }
            } else {
                boardColumns = [{ title: "Sem Grupo", color: "transparent", items: rows }];
            }

            // Exibir as outras propriedades no meta do card
            const metaCols = cols.filter(c => c.id !== 'page_title' && (!groupCol || c.id !== groupCol.id));

            boardContainer.innerHTML = boardColumns.map(bCol => {
                const cardsHtml = bCol.items.map(row => {
                    const metaHtml = metaCols.map(mCol => {
                        const val = row[mCol.id];
                        if (val === null || val === undefined || val === false || val === '') return '';
                        
                        let displayVal = val;
                        if (mCol.type === 'checkbox') displayVal = '✅ ' + mCol.name;
                        if (mCol.type === 'date') displayVal = '📅 ' + formatForDisplay(val);
                        if (mCol.type === 'select') {
                             const opt = mCol.options.find(o => o.id === val);
                             displayVal = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:var(--text-${opt?opt.color:'grey'}); margin-right:4px;"></span> ${opt ? opt.value : val}`;
                        }
                        
                        return `<div class="board-meta-item">${displayVal}</div>`;
                    }).join('');

                    return `
                        <div class="board-card">
                            <div class="board-card-title">${row.page_title}</div>
                            <div class="board-card-meta">${metaHtml}</div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="board-col">
                        <div class="board-header">
                            <span class="board-badge color-${bCol.color}">${bCol.title}</span>
                            <span class="board-count">${bCol.items.length}</span>
                        </div>
                        ${cardsHtml}
                    </div>
                `;
            }).join('');
        }

        // --- 5. Listeners de Eventos ---
        
        // Troca de Visão (Tabela / Board)
        document.getElementById('view-selector').addEventListener('change', (e) => {
            currentView = e.target.value;
            document.getElementById('view-table').classList.toggle('hidden', currentView !== 'table');
            document.getElementById('view-board').classList.toggle('hidden', currentView !== 'board');
            
            // Controle de Exibição do Botão Agrupar
            document.getElementById('groupby-container').classList.toggle('hidden', currentView !== 'board');
            
            // Limpar Popovers abertos
            document.querySelectorAll('.popover-menu').forEach(el => el.classList.remove('active'));
            
            applyFiltersAndRender();
        });

        // Controles dos Popovers (Filtros & Agrupar)
        document.getElementById('btn-toggle-filters').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('groupby-menu').classList.remove('active'); 
            document.getElementById('filter-menu').classList.toggle('active');
        });

        document.getElementById('btn-toggle-groupby').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('filter-menu').classList.remove('active'); 
            document.getElementById('groupby-menu').classList.toggle('active');
        });

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#btn-toggle-filters') && !e.target.closest('#filter-menu')) {
                document.getElementById('filter-menu').classList.remove('active');
            }
            if (!e.target.closest('#btn-toggle-groupby') && !e.target.closest('#groupby-menu')) {
                document.getElementById('groupby-menu').classList.remove('active');
            }
        });

        // Mudar Agrupamento
        document.getElementById('groupby-select').addEventListener('change', (e) => {
            currentGroupColId = e.target.value;
            updateGroupLabel();
            document.getElementById('groupby-menu').classList.remove('active');
            applyFiltersAndRender();
        });

        // Ações de Filtro
        document.getElementById('btn-add-rule').addEventListener('click', () => {
            activeFilters.push({ id: Date.now().toString(), colId: '', operator: 'equals', value: '' });
            renderFilterMenu();
            applyFiltersAndRender();
        });

        document.getElementById('filter-rules-container').addEventListener('input', (e) => {
            const filterId = e.target.getAttribute('data-filter-id');
            const filter = activeFilters.find(f => f.id === filterId);
            if (!filter) return;

            if (e.target.classList.contains('filter-col-select')) {
                filter.colId = e.target.value;
                filter.value = ''; 
                const colType = globalData.cols.find(c => c.id === filter.colId)?.type;
                if (colType !== 'text' && filter.operator === 'contains') filter.operator = 'equals';
                renderFilterMenu();
            } else if (e.target.classList.contains('filter-operator-select')) {
                filter.operator = e.target.value;
            } else if (e.target.classList.contains('filter-value-input')) {
                filter.value = e.target.value;
            }
            
            applyFiltersAndRender();
        });

        document.getElementById('filter-rules-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-filter')) {
                const filterId = e.target.getAttribute('data-filter-id');
                activeFilters = activeFilters.filter(f => f.id !== filterId);
                renderFilterMenu();
                applyFiltersAndRender();
            }
        });

        // --- 6. Inicialização ---
        async function init() {
            try {
                const response = await fetch("./data.json");
                const data = await response.json();

                globalData = parseTable(data);
                
                initGroupSelector();
                renderFilterMenu();
                applyFiltersAndRender();
            } catch (error) {
                document.getElementById('table-body').innerHTML = `
                    <tr><td class="loading" colspan="100%" style="color: #fa5252;">Erro: ${error.message}</td></tr>
                `;
            }
        }

        init();