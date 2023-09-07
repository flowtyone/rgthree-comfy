import { app } from "../../scripts/app.js";
import { BaseAnyInputConnectedNode } from "./base_any_input_connected_node.js";
import { NodeTypesString } from "./constants.js";
const MODE_ALWAYS = 0;
const MODE_MUTE = 2;
const MODE_BYPASS = 4;
class FastActionsButton extends BaseAnyInputConnectedNode {
    constructor(title) {
        super(title);
        this.isVirtualNode = true;
        this.serialize_widgets = true;
        this.widgetToData = new Map();
        this.nodeIdtoFunctionCache = new Map();
        this.executingFromShortcut = false;
        this.properties['buttonText'] = '🎬 Action!';
        this.properties['shortcutModifier'] = 'alt';
        this.properties['shortcutKey'] = '';
        this.buttonWidget = this.addWidget('button', this.properties['buttonText'], null, () => {
            this.executeConnectedNodes();
        }, { serialize: false });
        this.keypressBound = this.onKeypress.bind(this);
        this.keyupBound = this.onKeyup.bind(this);
    }
    configure(info) {
        super.configure(info);
        setTimeout(() => {
            if (info.widgets_values) {
                for (let [index, value] of info.widgets_values.entries()) {
                    if (index > 0) {
                        if (value.startsWith('comfy_action:')) {
                            this.addComfyActionWidget(index);
                            value = value.replace('comfy_action:', '');
                        }
                        if (this.widgets[index]) {
                            this.widgets[index].value = value;
                        }
                    }
                }
            }
        }, 100);
    }
    clone() {
        const cloned = super.clone();
        cloned.properties['buttonText'] = '🎬 Action!';
        cloned.properties['shortcutKey'] = '';
        return cloned;
    }
    onAdded(graph) {
        window.addEventListener('keydown', this.keypressBound);
        window.addEventListener('keyup', this.keyupBound);
    }
    onRemoved() {
        window.removeEventListener('keydown', this.keypressBound);
        window.removeEventListener('keyup', this.keyupBound);
    }
    async onKeypress(event) {
        const target = event.target;
        if (this.executingFromShortcut || target.localName == "input" || target.localName == "textarea") {
            return;
        }
        if (this.properties['shortcutKey'].trim() && this.properties['shortcutKey'].toLowerCase() === event.key.toLowerCase()) {
            let good = this.properties['shortcutModifier'] !== 'ctrl' || event.ctrlKey;
            good = good && this.properties['shortcutModifier'] !== 'alt' || event.altKey;
            good = good && this.properties['shortcutModifier'] !== 'shift' || event.shiftKey;
            good = good && this.properties['shortcutModifier'] !== 'meta' || event.metaKey;
            if (good) {
                setTimeout(() => {
                    this.executeConnectedNodes();
                }, 20);
                this.executingFromShortcut = true;
                event.preventDefault();
                event.stopImmediatePropagation();
                app.canvas.dirty_canvas = true;
                return false;
            }
        }
        return;
    }
    onKeyup(event) {
        const target = event.target;
        if (target.localName == "input" || target.localName == "textarea") {
            return;
        }
        this.executingFromShortcut = false;
    }
    onPropertyChanged(property, value, _prevValue) {
        if (property == 'buttonText') {
            this.buttonWidget.name = value;
        }
        if (property == 'shortcutKey') {
            value = value.trim();
            this.properties['shortcutKey'] = value && value[0].toLowerCase() || '';
        }
    }
    handleLinkedNodesStabilization(linkedNodes) {
        var _a, _b;
        let indexOffset = 1;
        for (const [index, node] of linkedNodes.entries()) {
            let widgetAtSlot = this.widgets[index + indexOffset];
            if (widgetAtSlot && ((_a = this.widgetToData.get(widgetAtSlot)) === null || _a === void 0 ? void 0 : _a.comfy)) {
                indexOffset++;
                widgetAtSlot = this.widgets[index + indexOffset];
            }
            if (!widgetAtSlot || this.widgetToData.get(widgetAtSlot).node !== node) {
                let widget = null;
                for (let i = index + indexOffset; i < this.widgets.length; i++) {
                    if (this.widgetToData.get(this.widgets[i]).node === node) {
                        widget = this.widgets.splice(i, 1)[0];
                        this.widgets.splice(index + indexOffset, 0, widget);
                        break;
                    }
                }
                if (!widget) {
                    const exposedActions = node.constructor.exposedActions || [];
                    widget = this.addWidget('combo', node.title, 'None', '', { values: ['None', 'Mute', 'Bypass', 'Enable', ...exposedActions] });
                    widget.serializeValue = async (_node, _index) => {
                        return widget === null || widget === void 0 ? void 0 : widget.value;
                    };
                    this.widgetToData.set(widget, { node });
                }
            }
        }
        for (let i = this.widgets.length - 1; i > linkedNodes.length + indexOffset - 1; i--) {
            const widgetAtSlot = this.widgets[i];
            if (widgetAtSlot && ((_b = this.widgetToData.get(widgetAtSlot)) === null || _b === void 0 ? void 0 : _b.comfy)) {
                continue;
            }
            this.removeWidget(widgetAtSlot);
        }
    }
    removeWidget(widgetOrSlot) {
        const widget = typeof widgetOrSlot === 'number' ? this.widgets[widgetOrSlot] : widgetOrSlot;
        if (widget && this.widgetToData.has(widget)) {
            this.widgetToData.delete(widget);
        }
        super.removeWidget(widgetOrSlot);
    }
    async executeConnectedNodes() {
        var _a;
        for (const widget of this.widgets) {
            if (widget == this.buttonWidget) {
                continue;
            }
            const action = widget.value;
            const { comfy, node } = (_a = this.widgetToData.get(widget)) !== null && _a !== void 0 ? _a : {};
            if (comfy) {
                if (action === 'Queue Prompt') {
                    await comfy.queuePrompt();
                }
                continue;
            }
            if (node) {
                if (action === 'Mute') {
                    node.mode = MODE_MUTE;
                }
                else if (action === 'Bypass') {
                    node.mode = MODE_BYPASS;
                }
                else if (action === 'Enable') {
                    node.mode = MODE_ALWAYS;
                }
                if (node.handleAction) {
                    await node.handleAction(action);
                }
                app.graph.change();
                continue;
            }
            console.warn('Fast Actions Button has a widget without correct data.');
        }
    }
    addComfyActionWidget(slot) {
        let widget = this.addWidget('combo', 'Comfy Action', 'None', () => {
            if (widget.value.startsWith('MOVE ')) {
                this.widgets.push(this.widgets.splice(this.widgets.indexOf(widget), 1)[0]);
                widget.value = widget['lastValue_'];
            }
            else if (widget.value.startsWith('REMOVE ')) {
                this.removeWidget(widget);
            }
            widget['lastValue_'] = widget.value;
        }, {
            values: ['None', 'Queue Prompt', 'REMOVE Comfy Action', 'MOVE to end']
        });
        widget['lastValue_'] = 'None';
        widget.serializeValue = async (_node, _index) => {
            return `comfy_app:${widget === null || widget === void 0 ? void 0 : widget.value}`;
        };
        this.widgetToData.set(widget, { comfy: app });
        if (slot != null) {
            this.widgets.splice(slot, 0, this.widgets.splice(this.widgets.indexOf(widget), 1)[0]);
        }
        return widget;
    }
    onSerialize(o) {
        var _a;
        super.onSerialize && super.onSerialize(o);
        for (let [index, value] of (o.widgets_values || []).entries()) {
            if (((_a = this.widgets[index]) === null || _a === void 0 ? void 0 : _a.name) === 'Comfy Action') {
                o.widgets_values[index] = `comfy_action:${value}`;
            }
        }
    }
    static setUp(clazz) {
        BaseAnyInputConnectedNode.setUp(clazz);
        addMenuItem(clazz, app, {
            name: '➕ Append a Comfy Action',
            callback: (nodeArg) => {
                nodeArg.addComfyActionWidget();
            }
        });
    }
}
FastActionsButton.type = NodeTypesString.FAST_ACTIONS_BUTTON;
FastActionsButton.title = NodeTypesString.FAST_ACTIONS_BUTTON;
FastActionsButton['@buttonText'] = { type: 'string' };
FastActionsButton['@shortcutModifier'] = { type: 'combo', values: ['ctrl', 'alt', 'shift'] };
FastActionsButton['@shortcutKey'] = { type: 'string' };
FastActionsButton.collapsible = false;
app.registerExtension({
    name: "rgthree.FastButtonAction",
    registerCustomNodes() {
        FastActionsButton.setUp(FastActionsButton);
    },
    loadedGraphNode(node) {
        if (node.type == FastActionsButton.title) {
            node._tempWidth = node.size[0];
        }
    }
});
