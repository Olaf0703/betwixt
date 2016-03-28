// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.DataGridContainerWidget}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineTreeView = function(model)
{
    WebInspector.DataGridContainerWidget.call(this);
    this.element.classList.add("timeline-tree-view");

    this._model = model;
    this._linkifier = new WebInspector.Linkifier();

    var nonessentialEvents = [
        WebInspector.TimelineModel.RecordType.EventDispatch,
        WebInspector.TimelineModel.RecordType.FunctionCall,
        WebInspector.TimelineModel.RecordType.TimerFire
    ];
    this._filters = [
        WebInspector.TimelineUIUtils.visibleEventsFilter(),
        new WebInspector.ExclusiveNameFilter(nonessentialEvents),
        new WebInspector.ExcludeTopLevelFilter()
    ];

    this._populateToolbar();

    var columns = [];
    this._populateColumns(columns);
    this.dataGrid = new WebInspector.SortableDataGrid(columns);
    this.dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortingChanged, this);

    this.appendDataGrid(this.dataGrid);
}

WebInspector.TimelineTreeView.prototype = {
    /**
     * @param {!WebInspector.TimelineSelection} selection
     */
    updateContents: function(selection)
    {
        this.setRange(selection.startTime(), selection.endTime());
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setRange: function(startTime, endTime)
    {
        this._startTime = startTime;
        this._endTime = endTime;
        this._refreshTree();
    },

    _populateToolbar: function() { },

    /**
     * @param {?string} scriptId
     * @param {string} url
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Element}
     */
    linkifyLocation: function(scriptId, url, lineNumber, columnNumber)
    {
        return this._linkifier.linkifyScriptLocation(this._model.target(), scriptId, url, lineNumber, columnNumber);
    },

    _refreshTree: function()
    {
        this._linkifier.reset();
        this.dataGrid.rootNode().removeChildren();
        var tree = this._buildTree();
        if (!tree.children)
            return;
        var maxSelfTime = 0;
        var maxTotalTime = 0;
        for (var child of tree.children.values()) {
            maxSelfTime = Math.max(maxSelfTime, child.selfTime);
            maxTotalTime = Math.max(maxTotalTime, child.totalTime);
        }
        for (var child of tree.children.values()) {
            // Exclude the idle time off the total calculation.
            var gridNode = new WebInspector.TimelineTreeView.GridNode(child, tree.totalTime, maxSelfTime, maxTotalTime, this);
            this.dataGrid.insertChild(gridNode);
        }
        this._sortingChanged();
    },

    /**
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _buildTree: function()
    {
        throw new Error("Not Implemented");
    },

    /**
     * @param {!Array.<!WebInspector.DataGrid.ColumnDescriptor>} columns
     */
    _populateColumns: function(columns)
    {
        columns.push({id: "self", title: WebInspector.UIString("Self Time"), width: "120px", sortable: true});
        columns.push({id: "total", title: WebInspector.UIString("Total Time"), width: "120px", sortable: true});
        columns.push({id: "activity", title: WebInspector.UIString("Activity"), disclosure: true, sortable: true});
    },

    _sortingChanged: function()
    {
        var columnIdentifier = this.dataGrid.sortColumnIdentifier();
        if (!columnIdentifier)
            return;
        var sortFunction;
        switch (columnIdentifier) {
        case "startTime":
            sortFunction = compareStartTime;
            break;
        case "self":
            sortFunction = compareNumericField.bind(null, "selfTime");
            break;
        case "total":
            sortFunction = compareNumericField.bind(null, "totalTime");
            break;
        case "activity":
            sortFunction = compareName;
            break;
        default:
            console.assert(false, "Unknown sort field: " + columnIdentifier);
            return;
        }
        this.dataGrid.sortNodes(sortFunction, !this.dataGrid.isSortOrderAscending());

        /**
         * @param {string} field
         * @param {!WebInspector.DataGridNode} a
         * @param {!WebInspector.DataGridNode} b
         * @return {number}
         */
        function compareNumericField(field, a, b)
        {
            var nodeA = /** @type {!WebInspector.TimelineTreeView.GridNode} */ (a);
            var nodeB = /** @type {!WebInspector.TimelineTreeView.GridNode} */ (b);
            return nodeA._profileNode[field] - nodeB._profileNode[field];
        }

        /**
         * @param {!WebInspector.DataGridNode} a
         * @param {!WebInspector.DataGridNode} b
         * @return {number}
         */
        function compareStartTime(a, b)
        {
            var nodeA = /** @type {!WebInspector.TimelineTreeView.GridNode} */ (a);
            var nodeB = /** @type {!WebInspector.TimelineTreeView.GridNode} */ (b);
            return nodeA._profileNode.event.startTime - nodeB._profileNode.event.startTime;
        }

        /**
         * @param {!WebInspector.DataGridNode} a
         * @param {!WebInspector.DataGridNode} b
         * @return {number}
         */
        function compareName(a, b)
        {
            var nodeA = /** @type {!WebInspector.TimelineTreeView.GridNode} */ (a);
            var nodeB = /** @type {!WebInspector.TimelineTreeView.GridNode} */ (b);
            var nameA = WebInspector.TimelineTreeView.eventNameForSorting(nodeA._profileNode.event);
            var nameB = WebInspector.TimelineTreeView.eventNameForSorting(nodeB._profileNode.event);
            return nameA.localeCompare(nameB);
        }
    },

    __proto__: WebInspector.DataGridContainerWidget.prototype
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {string}
 */
WebInspector.TimelineTreeView.eventId = function(event)
{
    var prefix = event.name === WebInspector.TimelineModel.RecordType.JSFrame ? "f:" : "";
    return prefix + WebInspector.TimelineTreeView.eventNameForSorting(event);
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {string}
 */
WebInspector.TimelineTreeView.eventNameForSorting = function(event)
{
    if (event.name === WebInspector.TimelineModel.RecordType.JSFrame) {
        var data = event.args["data"];
        return  data["functionName"] + "@" + (data["scriptId"] || data["url"] || "");
    }
    return event.name + ":@" + WebInspector.TimelineTreeView.eventURL(event);
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {?Object}
 */
WebInspector.TimelineTreeView.eventStackFrame = function(event)
{
    if (event.name == WebInspector.TimelineModel.RecordType.JSFrame)
        return event.args["data"];
    var topFrame = event.stackTrace && event.stackTrace[0];
    if (topFrame)
        return topFrame;
    var initiator = event.initiator;
    return initiator && initiator.stackTrace && initiator.stackTrace[0] || null;
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {?string}
 */
WebInspector.TimelineTreeView.eventURL = function(event)
{
    var frame = WebInspector.TimelineTreeView.eventStackFrame(event);
    return frame && frame["url"] || null;
}

/**
 * @constructor
 * @extends {WebInspector.SortableDataGridNode}
 * @param {!WebInspector.TimelineModel.ProfileTreeNode} profileNode
 * @param {number} grandTotalTime
 * @param {number} maxSelfTime
 * @param {number} maxTotalTime
 * @param {!WebInspector.TimelineTreeView} treeView
 */
WebInspector.TimelineTreeView.GridNode = function(profileNode, grandTotalTime, maxSelfTime, maxTotalTime, treeView)
{
    /**
     * @param {number} time
     * @return {string}
     */
    function formatMilliseconds(time)
    {
        return WebInspector.UIString("%.1f\u2009ms", time);
    }
    /**
     * @param {number} value
     * @return {string}
     */
    function formatPercent(value)
    {
        return WebInspector.UIString("%.2f\u2009%%", value);
    }

    this._populated = false;
    this._profileNode = profileNode;
    this._treeView = treeView;
    this._totalTime = grandTotalTime;
    this._maxTimes = { self: maxSelfTime, total: maxTotalTime };
    var selfTime = profileNode.selfTime;
    var selfPercent = selfTime / grandTotalTime * 100;
    var totalTime = profileNode.totalTime;
    var totalPercent = totalTime / grandTotalTime * 100;
    var data = {
        "activity": profileNode.name,
        "self-percent": formatPercent(selfPercent),
        "self": formatMilliseconds(selfTime),
        "total-percent": formatPercent(totalPercent),
        "total": formatMilliseconds(totalTime),
    };
    if (profileNode.event)
        data["startTime"] = formatMilliseconds(profileNode.event.startTime - treeView._model.minimumRecordTime());

    var hasChildren = this._profileNode.children ? this._profileNode.children.size > 0 : false;
    WebInspector.SortableDataGridNode.call(this, data, hasChildren);
}

WebInspector.TimelineTreeView.GridNode.prototype = {
    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        if (columnIdentifier === "activity")
            return this._createNameCell(columnIdentifier);
        return this._createValueCell(columnIdentifier) || WebInspector.DataGridNode.prototype.createCell.call(this, columnIdentifier);
    },

    /**
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    _createNameCell: function(columnIdentifier)
    {
        var cell = this.createTD(columnIdentifier);
        var container = cell.createChild("div", "name-container");
        var icon = container.createChild("div", "activity-icon");
        var name = container.createChild("div", "activity-name");
        var event = this._profileNode.event;
        if (event) {
            var data = event.args["data"];
            var deoptReason = data && data["deoptReason"];
            if (deoptReason && deoptReason !== "no reason")
                container.createChild("div", "activity-warning").title = WebInspector.UIString("Not optimized: %s", deoptReason);
            name.textContent = event.name === WebInspector.TimelineModel.RecordType.JSFrame
                ? WebInspector.beautifyFunctionName(event.args["data"]["functionName"])
                : WebInspector.TimelineUIUtils.eventTitle(event);
            var frame = WebInspector.TimelineTreeView.eventStackFrame(event);
            var scriptId = frame && frame["scriptId"];
            var url = frame && frame["url"];
            var lineNumber = frame && frame["lineNumber"] || 1;
            var columnNumber = frame && frame["columnNumber"];
            if (url)
                container.createChild("div", "activity-link").appendChild(this._treeView.linkifyLocation(scriptId, url, lineNumber, columnNumber));
            icon.style.backgroundColor = WebInspector.TimelineUIUtils.eventColor(event);
        } else {
            name.textContent = this._profileNode.name;
            icon.style.backgroundColor = this._profileNode.color;
        }
        return cell;
    },

    /**
     * @param {string} columnIdentifier
     * @return {?Element}
     */
    _createValueCell: function(columnIdentifier)
    {
        if (columnIdentifier !== "self" && columnIdentifier !== "total" && columnIdentifier !== "startTime")
            return null;
        var cell = this.createTD(columnIdentifier);
        cell.className = "numeric-column";
        var textDiv = cell.createChild("div");
        textDiv.createChild("span").textContent = this.data[columnIdentifier];
        var percentColumn = columnIdentifier + "-percent";
        if (percentColumn in this.data) {
            textDiv.createChild("span", "percent-column").textContent = this.data[percentColumn];
            textDiv.classList.add("profile-multiple-values");
        }
        var bar = cell.createChild("div", "background-bar-container").createChild("div", "background-bar");
        bar.style.width = (this._profileNode[columnIdentifier + "Time"] * 100 / this._maxTimes[columnIdentifier]).toFixed(1) + "%";
        return cell;
    },

    /**
     * @override
     */
    populate: function()
    {
        if (this._populated)
            return;
        this._populated = true;
        if (!this._profileNode.children)
            return;
        for (var node of this._profileNode.children.values()) {
            var gridNode = new WebInspector.TimelineTreeView.GridNode(node, this._totalTime, this._maxTimes.self, this._maxTimes.total, this._treeView);
            this.insertChildOrdered(gridNode);
        }
    },

    __proto__: WebInspector.SortableDataGridNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineTreeView}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.AggregatedTimelineTreeView = function(model)
{
    this._groupBySetting = WebInspector.settings.createSetting("timelineTreeGroupBy", WebInspector.AggregatedTimelineTreeView.GroupBy.Category);
    WebInspector.TimelineTreeView.call(this, model);
}

/**
 * @enum {string}
 */
WebInspector.AggregatedTimelineTreeView.GroupBy = {
    None: "None",
    Category: "Category",
    Domain: "Domain",
    Subdomain: "Subdomain",
    URL: "URL"
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {string}
 */
WebInspector.AggregatedTimelineTreeView.eventId = function(event)
{
    if (event.name === WebInspector.TimelineModel.RecordType.JSFrame) {
        var data = event.args["data"];
        return "f:" + data["functionName"] + "@" + (data["scriptId"] || data["url"] || "");
    }
    return event.name + ":@" + WebInspector.TimelineTreeView.eventURL(event);
}

WebInspector.AggregatedTimelineTreeView.prototype = {
    /**
     * @override
     */
    _populateToolbar: function()
    {
        var panelToolbar = new WebInspector.Toolbar(this.element);
        this._groupByCombobox = new WebInspector.ToolbarComboBox(this._onGroupByChanged.bind(this));
        /**
         * @param {string} name
         * @param {string} id
         * @this {WebInspector.TimelineTreeView}
         */
        function addGroupingOption(name, id)
        {
            var option = this._groupByCombobox.createOption(name, "", id);
            this._groupByCombobox.addOption(option);
            if (id === this._groupBySetting.get())
                this._groupByCombobox.select(option);
        }
        addGroupingOption.call(this, WebInspector.UIString("No Grouping"), WebInspector.AggregatedTimelineTreeView.GroupBy.None);
        addGroupingOption.call(this, WebInspector.UIString("Group by Category"), WebInspector.AggregatedTimelineTreeView.GroupBy.Category);
        addGroupingOption.call(this, WebInspector.UIString("Group by Domain"), WebInspector.AggregatedTimelineTreeView.GroupBy.Domain);
        addGroupingOption.call(this, WebInspector.UIString("Group by Subdomain"), WebInspector.AggregatedTimelineTreeView.GroupBy.Subdomain);
        addGroupingOption.call(this, WebInspector.UIString("Group by URL"), WebInspector.AggregatedTimelineTreeView.GroupBy.URL);
        panelToolbar.appendToolbarItem(this._groupByCombobox);
    },

    _onGroupByChanged: function()
    {
        this._groupBySetting.set(this._groupByCombobox.selectedOption().value);
        this._refreshTree();
    },

    /**
     * @param {function(!WebInspector.TimelineModel.ProfileTreeNode):string} nodeToGroupId
     * @param {!WebInspector.TimelineModel.ProfileTreeNode} node
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _nodeToGroupNode: function(nodeToGroupId, node)
    {
        var id = nodeToGroupId(node);
        return this._groupNodes.get(id) || this._buildGroupNode(id, node.event);
    },

    /**
     * @param {string} id
     * @param {!WebInspector.TracingModel.Event} event
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _buildGroupNode: function(id, event)
    {
        var groupNode = new WebInspector.TimelineModel.ProfileTreeNode();
        groupNode.selfTime = 0;
        groupNode.totalTime = 0;
        groupNode.children = new Map();
        this._groupNodes.set(id, groupNode);
        var categories = WebInspector.TimelineUIUtils.categories();
        switch (this._groupBySetting.get()) {
        case WebInspector.AggregatedTimelineTreeView.GroupBy.Category:
            var category = categories[id] || categories["other"];
            groupNode.name = category.title;
            groupNode.color = category.fillColorStop1;
            break;
        case WebInspector.AggregatedTimelineTreeView.GroupBy.Domain:
        case WebInspector.AggregatedTimelineTreeView.GroupBy.Subdomain:
        case WebInspector.AggregatedTimelineTreeView.GroupBy.URL:
            groupNode.name = id || WebInspector.UIString("unattributed");
            groupNode.color = id ? WebInspector.TimelineUIUtils.eventColor(event) : categories["other"].fillColorStop1;
            break;
        }
        return groupNode;
    },

    /**
     * @return {?function(!WebInspector.TimelineModel.ProfileTreeNode):string}
     */
    _nodeToGroupIdFunction: function()
    {
        /**
         * @param {!WebInspector.TimelineModel.ProfileTreeNode} node
         * @return {string}
         */
        function groupByCategory(node)
        {
            return node.event ? WebInspector.TimelineUIUtils.eventStyle(node.event).category.name : "";
        }

        /**
         * @param {!WebInspector.TimelineModel.ProfileTreeNode} node
         * @return {string}
         */
        function groupByURL(node)
        {
            return WebInspector.TimelineTreeView.eventURL(node.event) || "";
        }

        /**
         * @param {boolean} groupSubdomains
         * @param {!WebInspector.TimelineModel.ProfileTreeNode} node
         * @return {string}
         */
        function groupByDomain(groupSubdomains, node)
        {
            var url = WebInspector.TimelineTreeView.eventURL(node.event) || "";
            if (url.startsWith("extensions::"))
                return WebInspector.UIString("[Chrome extensions overhead]");
            var parsedURL = url.asParsedURL();
            if (!parsedURL)
                return "";
            if (parsedURL.scheme === "chrome-extension") {
                url = parsedURL.scheme + "://" + parsedURL.host;
                var displayName = executionContextNamesByOrigin.get(url);
                return displayName ? WebInspector.UIString("[Chrome extension] %s", displayName) : url;
            }
            if (!groupSubdomains)
                return parsedURL.host;
            if (/^[.0-9]+$/.test(parsedURL.host))
                return parsedURL.host;
            var domainMatch = /([^.]*\.)?[^.]*$/.exec(parsedURL.host);
            return domainMatch && domainMatch[0] || "";
        }

        var executionContextNamesByOrigin = new Map();
        for (var target of WebInspector.targetManager.targets()) {
            for (var context of target.runtimeModel.executionContexts())
                executionContextNamesByOrigin.set(context.origin, context.name);
        }
        var groupByMap = /** @type {!Map<!WebInspector.AggregatedTimelineTreeView.GroupBy,?function(!WebInspector.TimelineModel.ProfileTreeNode):string>} */ (new Map([
            [WebInspector.AggregatedTimelineTreeView.GroupBy.None, null],
            [WebInspector.AggregatedTimelineTreeView.GroupBy.Category, groupByCategory],
            [WebInspector.AggregatedTimelineTreeView.GroupBy.Subdomain, groupByDomain.bind(null, false)],
            [WebInspector.AggregatedTimelineTreeView.GroupBy.Domain, groupByDomain.bind(null, true)],
            [WebInspector.AggregatedTimelineTreeView.GroupBy.URL, groupByURL]
        ]));
        return groupByMap.get(this._groupBySetting.get()) || null;
    },

    __proto__: WebInspector.TimelineTreeView.prototype,
};

/**
 * @constructor
 * @extends {WebInspector.AggregatedTimelineTreeView}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.CallTreeTimelineTreeView = function(model)
{
    WebInspector.AggregatedTimelineTreeView.call(this, model);
    this.dataGrid.markColumnAsSortedBy("total", WebInspector.DataGrid.Order.Descending);
}

WebInspector.CallTreeTimelineTreeView.prototype = {
    /**
     * @override
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _buildTree: function()
    {
        var topDown = WebInspector.TimelineModel.buildTopDownTree(this._model.mainThreadEvents(), this._startTime, this._endTime, this._filters, WebInspector.AggregatedTimelineTreeView.eventId);
        return this._performTopDownTreeGrouping(topDown);
    },

    /**
     * @param {!WebInspector.TimelineModel.ProfileTreeNode} topDownTree
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _performTopDownTreeGrouping: function(topDownTree)
    {
        var nodeToGroupId = this._nodeToGroupIdFunction();
        if (nodeToGroupId) {
            this._groupNodes = new Map();
            for (var node of topDownTree.children.values()) {
                var groupNode = this._nodeToGroupNode(nodeToGroupId, node);
                groupNode.selfTime += node.selfTime;
                groupNode.totalTime += node.totalTime;
                groupNode.children.set(node.id, node);
            }
            topDownTree.children = this._groupNodes;
            this._groupNodes = null;
        }
        return topDownTree;
    },

    __proto__: WebInspector.AggregatedTimelineTreeView.prototype
};

/**
 * @constructor
 * @extends {WebInspector.AggregatedTimelineTreeView}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.BottomUpTimelineTreeView = function(model)
{
    WebInspector.AggregatedTimelineTreeView.call(this, model);
    this.dataGrid.markColumnAsSortedBy("self", WebInspector.DataGrid.Order.Descending);
}

WebInspector.BottomUpTimelineTreeView.prototype = {
    /**
     * @override
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _buildTree: function()
    {
        var topDown = WebInspector.TimelineModel.buildTopDownTree(this._model.mainThreadEvents(), this._startTime, this._endTime, this._filters, WebInspector.AggregatedTimelineTreeView.eventId);
        return this._buildBottomUpTree(topDown);
    },

    /**
     * @param {!WebInspector.TimelineModel.ProfileTreeNode} topDownTree
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _buildBottomUpTree: function(topDownTree)
    {
        this._groupNodes = new Map();
        var nodeToGroupId = this._nodeToGroupIdFunction();
        var nodeToGroupNode = nodeToGroupId ? this._nodeToGroupNode.bind(this, nodeToGroupId) : null;
        var bottomUpRoot = WebInspector.TimelineModel.buildBottomUpTree(topDownTree, nodeToGroupNode);
        for (var group of this._groupNodes)
            bottomUpRoot.children.set(group[0], group[1]);
        return bottomUpRoot;
    },

    __proto__: WebInspector.AggregatedTimelineTreeView.prototype
};

/**
 * @constructor
 * @extends {WebInspector.TimelineTreeView}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.EventsTimelineTreeView = function(model)
{
    WebInspector.TimelineTreeView.call(this, model);
    this.dataGrid.markColumnAsSortedBy("startTime", WebInspector.DataGrid.Order.Ascending);
}

WebInspector.EventsTimelineTreeView.prototype = {
    /**
     * @override
     * @return {!WebInspector.TimelineModel.ProfileTreeNode}
     */
    _buildTree: function()
    {
        return WebInspector.TimelineModel.buildTopDownTree(this._model.mainThreadEvents(), this._startTime, this._endTime, this._filters, uniqueSymbol);

        /**
         * @return {symbol}
         */
        function uniqueSymbol()
        {
            return Symbol("eventId");
        }
    },

    /**
     * @override
     */
    _populateToolbar: function() { },

    /**
     * @override
     * @param {!Array<!WebInspector.DataGrid.ColumnDescriptor>} columns
     */
    _populateColumns: function(columns)
    {
        columns.push({id: "startTime", title: WebInspector.UIString("Start Time"), width: "60px", sortable: true});
        WebInspector.TimelineTreeView.prototype._populateColumns.call(this, columns);
    },

    __proto__: WebInspector.TimelineTreeView.prototype
}
