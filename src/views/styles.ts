/**
 * Shared UI styles for Muxpanel webviews
 * Modern, consistent styling across all panels
 */

export const baseStyles = `
    /* CSS Reset & Variables */
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    :root {
        --mux-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
        --mux-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.15);
        --mux-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.2);
        --mux-radius-sm: 6px;
        --mux-radius-md: 8px;
        --mux-radius-lg: 12px;
        --mux-radius-xl: 16px;
        --mux-transition: all 0.2s ease;
        --mux-gradient-primary: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-textLink-foreground));
        --mux-gradient-success: linear-gradient(135deg, #28a745, #20c997);
        --mux-gradient-warning: linear-gradient(135deg, #ffc107, #fd7e14);
        --mux-gradient-danger: linear-gradient(135deg, #dc3545, #e83e8c);
        --mux-gradient-info: linear-gradient(135deg, #17a2b8, #6f42c1);
    }

    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        line-height: 1.6;
        padding: 24px;
        min-height: 100vh;
    }

    /* Typography */
    h1, h2, h3, h4 {
        font-weight: 600;
        letter-spacing: -0.02em;
        margin-bottom: 0.5em;
    }

    h1 {
        font-size: 1.75em;
        display: flex;
        align-items: center;
        gap: 12px;
        padding-bottom: 16px;
        margin-bottom: 24px;
        border-bottom: 2px solid var(--vscode-panel-border);
    }

    h2 {
        font-size: 1.25em;
        color: var(--vscode-foreground);
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 28px;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    h3 {
        font-size: 1.1em;
        margin-top: 20px;
        margin-bottom: 12px;
    }

    p {
        margin-bottom: 1em;
        color: var(--vscode-descriptionForeground);
    }

    /* Cards & Containers */
    .card {
        background: var(--vscode-sideBar-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        padding: 20px;
        margin-bottom: 16px;
        transition: var(--mux-transition);
    }

    .card:hover {
        border-color: var(--vscode-focusBorder);
        box-shadow: var(--mux-shadow-sm);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    .card-title {
        font-size: 1.1em;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .section {
        background: var(--vscode-sideBar-background);
        border-radius: var(--mux-radius-lg);
        padding: 20px;
        margin: 16px 0;
        border: 1px solid var(--vscode-panel-border);
    }

    /* Form Styles */
    .form-group {
        margin-bottom: 20px;
    }

    label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        font-size: 0.9em;
        color: var(--vscode-foreground);
    }

    label.required::after {
        content: ' *';
        color: var(--vscode-errorForeground);
    }

    input, textarea, select {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--vscode-input-border);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: var(--mux-radius-md);
        font-size: 14px;
        transition: var(--mux-transition);
    }

    input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 2px var(--vscode-focusBorder)33;
    }

    input:disabled, textarea:disabled, select:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: var(--vscode-input-background);
    }

    input::placeholder, textarea::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }

    textarea {
        min-height: 120px;
        resize: vertical;
        font-family: inherit;
    }

    select {
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 36px;
    }

    /* Grid Layouts */
    .row {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
    }

    .row-3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
    }

    .row-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
    }

    @media (max-width: 768px) {
        .row, .row-3, .row-4 {
            grid-template-columns: 1fr;
        }
    }

    /* Button Styles */
    button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 20px;
        border: none;
        border-radius: var(--mux-radius-md);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: var(--mux-transition);
        white-space: nowrap;
    }

    button:active {
        transform: translateY(1px);
    }

    .btn-primary {
        background: var(--mux-gradient-primary);
        color: white;
        box-shadow: var(--mux-shadow-sm);
    }

    .btn-primary:hover {
        filter: brightness(1.1);
        box-shadow: var(--mux-shadow-md);
    }

    .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-success {
        background: var(--mux-gradient-success);
        color: white;
    }

    .btn-success:hover {
        filter: brightness(1.1);
    }

    .btn-warning {
        background: var(--mux-gradient-warning);
        color: #1a1a1a;
    }

    .btn-danger {
        background: var(--mux-gradient-danger);
        color: white;
    }

    .btn-danger:hover {
        filter: brightness(1.1);
    }

    .btn-ghost {
        background: transparent;
        color: var(--vscode-foreground);
        border: 1px solid var(--vscode-panel-border);
    }

    .btn-ghost:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }

    .btn-small {
        padding: 6px 12px;
        font-size: 12px;
    }

    .btn-icon {
        padding: 8px;
        width: 36px;
        height: 36px;
        border-radius: var(--mux-radius-sm);
    }

    .buttons {
        display: flex;
        gap: 12px;
        margin-top: 24px;
        flex-wrap: wrap;
    }

    /* Badges */
    .badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.75em;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .badge-default {
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
    }

    .badge-success {
        background: rgba(40, 167, 69, 0.2);
        color: #28a745;
    }

    .badge-warning {
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
    }

    .badge-danger {
        background: rgba(220, 53, 69, 0.2);
        color: #dc3545;
    }

    .badge-info {
        background: rgba(23, 162, 184, 0.2);
        color: #17a2b8;
    }

    /* Progress Bars */
    .progress-container {
        width: 100%;
        margin: 12px 0;
    }

    .progress-bar {
        width: 100%;
        height: 10px;
        background: var(--vscode-progressBar-background);
        border-radius: 10px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: var(--mux-gradient-primary);
        border-radius: 10px;
        transition: width 0.3s ease;
    }

    .progress-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        margin-top: 6px;
    }

    /* Lists */
    .item-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .item-list li {
        padding: 14px 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
        cursor: pointer;
        transition: var(--mux-transition);
        border-radius: var(--mux-radius-sm);
        margin-bottom: 4px;
    }

    .item-list li:hover {
        background: var(--vscode-list-hoverBackground);
        transform: translateX(4px);
    }

    .item-list li:last-child {
        border-bottom: none;
    }

    .item-title {
        font-weight: 600;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .item-meta {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    /* Meta Info Bar */
    .meta-info {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        padding: 16px 20px;
        background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
        border-radius: var(--mux-radius-lg);
        margin-bottom: 24px;
        font-size: 0.9em;
        border: 1px solid var(--vscode-panel-border);
    }

    .meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .meta-label {
        color: var(--vscode-descriptionForeground);
    }

    .meta-value {
        font-weight: 500;
    }

    /* Tabs */
    .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 24px;
        border-bottom: 2px solid var(--vscode-panel-border);
        padding-bottom: 0;
    }

    .tab {
        padding: 12px 24px;
        cursor: pointer;
        border: none;
        background: transparent;
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
        font-weight: 500;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        transition: var(--mux-transition);
        border-radius: var(--mux-radius-sm) var(--mux-radius-sm) 0 0;
    }

    .tab:hover {
        background: var(--vscode-list-hoverBackground);
        color: var(--vscode-foreground);
    }

    .tab.active {
        color: var(--vscode-textLink-foreground);
        border-bottom-color: var(--vscode-textLink-foreground);
        background: var(--vscode-editor-background);
    }

    .tab-content {
        display: none;
        animation: fadeIn 0.2s ease;
    }

    .tab-content.active {
        display: block;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Empty States */
    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    .empty-state-title {
        font-size: 1.1em;
        font-weight: 500;
        margin-bottom: 8px;
        color: var(--vscode-foreground);
    }

    .empty-state-text {
        font-size: 0.9em;
    }

    /* Stats Grid */
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 16px;
        margin-bottom: 28px;
    }

    .stat-card {
        background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        padding: 20px;
        text-align: center;
        transition: var(--mux-transition);
        position: relative;
        overflow: hidden;
    }

    .stat-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: var(--mux-gradient-primary);
        opacity: 0;
        transition: var(--mux-transition);
    }

    .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--mux-shadow-md);
    }

    .stat-card:hover::before {
        opacity: 1;
    }

    .stat-number {
        font-size: 2em;
        font-weight: 700;
        background: var(--mux-gradient-primary);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1.2;
    }

    .stat-number.warning {
        background: var(--mux-gradient-danger);
        -webkit-background-clip: text;
        background-clip: text;
    }

    .stat-label {
        color: var(--vscode-descriptionForeground);
        font-size: 0.85em;
        margin-top: 8px;
        font-weight: 500;
    }

    /* Tooltip */
    .tooltip {
        position: relative;
    }

    .tooltip::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 10px;
        background: var(--vscode-editorWidget-background);
        color: var(--vscode-editorWidget-foreground);
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: var(--mux-radius-sm);
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: var(--mux-transition);
    }

    .tooltip:hover::after {
        opacity: 1;
    }

    /* Animations */
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
    }

    .animate-pulse {
        animation: pulse 2s ease-in-out infinite;
    }

    .animate-slide-in {
        animation: slideIn 0.3s ease forwards;
    }

    /* Two Column Layout */
    .two-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }

    @media (max-width: 900px) {
        .two-columns {
            grid-template-columns: 1fr;
        }
    }

    /* Project Context Banner */
    .context-banner {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 20px;
        background: linear-gradient(135deg, var(--vscode-badge-background), var(--vscode-sideBar-background));
        border: 1px solid var(--vscode-panel-border);
        border-radius: 25px;
        margin-bottom: 20px;
        font-size: 0.9em;
    }

    .context-banner.active {
        background: var(--mux-gradient-success);
        color: white;
        border-color: transparent;
    }

    .context-banner-icon {
        font-size: 1.2em;
    }

    /* Loading State */
    .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--vscode-panel-border);
        border-top-color: var(--vscode-textLink-foreground);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    /* Scrollbar Styling */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    ::-webkit-scrollbar-track {
        background: transparent;
    }

    ::-webkit-scrollbar-thumb {
        background: var(--vscode-scrollbarSlider-background);
        border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: var(--vscode-scrollbarSlider-hoverBackground);
    }

    /* Icon Styles */
    .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
    }

    .icon-sm {
        width: 16px;
        height: 16px;
        font-size: 14px;
    }

    .icon-lg {
        width: 32px;
        height: 32px;
        font-size: 24px;
    }
`;

export const dashboardStyles = `
    ${baseStyles}
    
    .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 24px;
    }

    .dashboard-header h1 {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
    }

    .refresh-btn {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        padding: 8px 16px;
        border-radius: var(--mux-radius-md);
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .view-all-link {
        font-size: 0.85em;
        color: var(--vscode-textLink-foreground);
        cursor: pointer;
        text-decoration: none;
    }

    .view-all-link:hover {
        text-decoration: underline;
    }
`;

export const formStyles = `
    ${baseStyles}

    .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
    }

    .form-actions {
        display: flex;
        gap: 8px;
    }

    .form-section {
        background: var(--vscode-sideBar-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        padding: 24px;
        margin-bottom: 24px;
    }

    .form-section-title {
        font-size: 1em;
        font-weight: 600;
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .inline-form {
        display: flex;
        gap: 12px;
        align-items: flex-end;
    }

    .inline-form .form-group {
        flex: 1;
        margin-bottom: 0;
    }

    .field-hint {
        font-size: 0.8em;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
    }
`;

export const traceLinkStyles = `
    .trace-link {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-md);
        margin-bottom: 10px;
        transition: var(--mux-transition);
    }

    .trace-link:hover {
        border-color: var(--vscode-focusBorder);
        box-shadow: var(--mux-shadow-sm);
    }

    .trace-link.suspect {
        border-color: #f0ad4e;
        background: rgba(240, 173, 78, 0.08);
        border-left: 3px solid #f0ad4e;
    }

    .link-type-badge {
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        padding: 4px 10px;
        border-radius: var(--mux-radius-sm);
        font-size: 0.75em;
        font-weight: 600;
        text-transform: uppercase;
    }

    .link-target {
        flex: 1;
        font-weight: 500;
    }

    .suspect-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #f0ad4e;
        font-weight: 600;
        font-size: 0.85em;
    }

    .link-actions {
        display: flex;
        gap: 8px;
    }

    .add-trace-form {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 16px;
        padding: 20px;
        background: var(--vscode-sideBar-background);
        border: 1px dashed var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        margin-top: 20px;
        align-items: end;
    }
`;

export const commentStyles = `
    .comment {
        padding: 16px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-md);
        margin-bottom: 12px;
        transition: var(--mux-transition);
    }

    .comment:hover {
        border-color: var(--vscode-focusBorder);
    }

    .comment.resolved {
        opacity: 0.6;
        background: var(--vscode-sideBar-background);
    }

    .comment-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
        font-size: 0.85em;
    }

    .comment-author {
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .comment-date {
        color: var(--vscode-descriptionForeground);
    }

    .resolved-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #28a745;
        font-weight: 500;
    }

    .comment-text {
        line-height: 1.6;
        margin-bottom: 12px;
    }

    .add-comment-form {
        display: flex;
        gap: 12px;
        margin-top: 20px;
        padding: 16px;
        background: var(--vscode-sideBar-background);
        border-radius: var(--mux-radius-lg);
    }

    .add-comment-form textarea {
        flex: 1;
        min-height: 80px;
    }
`;

export const followUpStyles = `
    .followup-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        margin-bottom: 12px;
        transition: var(--mux-transition);
    }

    .followup-card:hover {
        border-color: var(--vscode-focusBorder);
        box-shadow: var(--mux-shadow-sm);
    }

    .followup-card.completed {
        opacity: 0.6;
        background: var(--vscode-sideBar-background);
    }

    .followup-card.completed .followup-content {
        text-decoration: line-through;
    }

    .followup-checkbox {
        width: 24px;
        height: 24px;
        border: 2px solid var(--vscode-panel-border);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--mux-transition);
        flex-shrink: 0;
    }

    .followup-checkbox:hover {
        border-color: var(--vscode-textLink-foreground);
        background: var(--vscode-textLink-foreground)22;
    }

    .followup-card.completed .followup-checkbox {
        background: var(--mux-gradient-success);
        border-color: transparent;
        color: white;
    }

    .followup-info {
        flex: 1;
    }

    .followup-content {
        font-weight: 500;
        margin-bottom: 4px;
    }

    .followup-meta {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .add-followup-form {
        padding: 20px;
        background: var(--vscode-sideBar-background);
        border: 1px dashed var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        margin-top: 20px;
    }

    .add-followup-form h3 {
        margin-top: 0;
        margin-bottom: 16px;
    }
`;

export const milestoneStyles = `
    .milestone-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        margin-bottom: 12px;
        transition: var(--mux-transition);
    }

    .milestone-card:hover {
        border-color: var(--vscode-focusBorder);
        box-shadow: var(--mux-shadow-sm);
    }

    .milestone-icon {
        width: 40px;
        height: 40px;
        background: var(--mux-gradient-info);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
    }

    .milestone-info {
        flex: 1;
    }

    .milestone-name {
        font-weight: 600;
        margin-bottom: 4px;
    }

    .milestone-meta {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .add-milestone-form {
        padding: 20px;
        background: var(--vscode-sideBar-background);
        border: 1px dashed var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        margin-top: 20px;
    }

    .add-milestone-form h3 {
        margin-top: 0;
        margin-bottom: 16px;
    }
`;

export const historyStyles = `
    .history-list {
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--mux-radius-lg);
        overflow: hidden;
    }

    .history-item {
        display: grid;
        grid-template-columns: 60px 1fr 120px 160px;
        gap: 16px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
        font-size: 0.9em;
        align-items: center;
    }

    .history-item:last-child {
        border-bottom: none;
    }

    .history-item:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .history-version {
        font-weight: 600;
        color: var(--vscode-textLink-foreground);
    }

    .history-field {
        font-weight: 500;
    }

    .history-user {
        color: var(--vscode-descriptionForeground);
    }

    .history-date {
        color: var(--vscode-descriptionForeground);
        text-align: right;
    }
`;

// Helper function to escape HTML
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
