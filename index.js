(function () {
    'use strict';

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const directives = new WeakMap();
    /**
     * Brands a function as a directive factory function so that lit-html will call
     * the function during template rendering, rather than passing as a value.
     *
     * A _directive_ is a function that takes a Part as an argument. It has the
     * signature: `(part: Part) => void`.
     *
     * A directive _factory_ is a function that takes arguments for data and
     * configuration and returns a directive. Users of directive usually refer to
     * the directive factory as the directive. For example, "The repeat directive".
     *
     * Usually a template author will invoke a directive factory in their template
     * with relevant arguments, which will then return a directive function.
     *
     * Here's an example of using the `repeat()` directive factory that takes an
     * array and a function to render an item:
     *
     * ```js
     * html`<ul><${repeat(items, (item) => html`<li>${item}</li>`)}</ul>`
     * ```
     *
     * When `repeat` is invoked, it returns a directive function that closes over
     * `items` and the template function. When the outer template is rendered, the
     * return directive function is called with the Part for the expression.
     * `repeat` then performs it's custom logic to render multiple items.
     *
     * @param f The directive factory function. Must be a function that returns a
     * function of the signature `(part: Part) => void`. The returned function will
     * be called with the part object.
     *
     * @example
     *
     * import {directive, html} from 'lit-html';
     *
     * const immutable = directive((v) => (part) => {
     *   if (part.value !== v) {
     *     part.setValue(v)
     *   }
     * });
     */
    const directive = (f) => ((...args) => {
        const d = f(...args);
        directives.set(d, true);
        return d;
    });
    const isDirective = (o) => {
        return typeof o === 'function' && directives.has(o);
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * True if the custom elements polyfill is in use.
     */
    const isCEPolyfill = typeof window !== 'undefined' &&
        window.customElements != null &&
        window.customElements.polyfillWrapFlushCallback !==
            undefined;
    /**
     * Removes nodes, starting from `start` (inclusive) to `end` (exclusive), from
     * `container`.
     */
    const removeNodes = (container, start, end = null) => {
        while (start !== end) {
            const n = start.nextSibling;
            container.removeChild(start);
            start = n;
        }
    };

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * A sentinel value that signals that a value was handled by a directive and
     * should not be written to the DOM.
     */
    const noChange = {};
    /**
     * A sentinel value that signals a NodePart to fully clear its content.
     */
    const nothing = {};

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An expression marker with embedded unique key to avoid collision with
     * possible text in templates.
     */
    const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
    /**
     * An expression marker used text-positions, multi-binding attributes, and
     * attributes with markup-like text values.
     */
    const nodeMarker = `<!--${marker}-->`;
    const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
    /**
     * Suffix appended to all bound attribute names.
     */
    const boundAttributeSuffix = '$lit$';
    /**
     * An updatable Template that tracks the location of dynamic parts.
     */
    class Template {
        constructor(result, element) {
            this.parts = [];
            this.element = element;
            const nodesToRemove = [];
            const stack = [];
            // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
            const walker = document.createTreeWalker(element.content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
            // Keeps track of the last index associated with a part. We try to delete
            // unnecessary nodes, but we never want to associate two different parts
            // to the same index. They must have a constant node between.
            let lastPartIndex = 0;
            let index = -1;
            let partIndex = 0;
            const { strings, values: { length } } = result;
            while (partIndex < length) {
                const node = walker.nextNode();
                if (node === null) {
                    // We've exhausted the content inside a nested template element.
                    // Because we still have parts (the outer for-loop), we know:
                    // - There is a template in the stack
                    // - The walker will find a nextNode outside the template
                    walker.currentNode = stack.pop();
                    continue;
                }
                index++;
                if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                    if (node.hasAttributes()) {
                        const attributes = node.attributes;
                        const { length } = attributes;
                        // Per
                        // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                        // attributes are not guaranteed to be returned in document order.
                        // In particular, Edge/IE can return them out of order, so we cannot
                        // assume a correspondence between part index and attribute index.
                        let count = 0;
                        for (let i = 0; i < length; i++) {
                            if (endsWith(attributes[i].name, boundAttributeSuffix)) {
                                count++;
                            }
                        }
                        while (count-- > 0) {
                            // Get the template literal section leading up to the first
                            // expression in this attribute
                            const stringForPart = strings[partIndex];
                            // Find the attribute name
                            const name = lastAttributeNameRegex.exec(stringForPart)[2];
                            // Find the corresponding attribute
                            // All bound attributes have had a suffix added in
                            // TemplateResult#getHTML to opt out of special attribute
                            // handling. To look up the attribute value we also need to add
                            // the suffix.
                            const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                            const attributeValue = node.getAttribute(attributeLookupName);
                            node.removeAttribute(attributeLookupName);
                            const statics = attributeValue.split(markerRegex);
                            this.parts.push({ type: 'attribute', index, name, strings: statics });
                            partIndex += statics.length - 1;
                        }
                    }
                    if (node.tagName === 'TEMPLATE') {
                        stack.push(node);
                        walker.currentNode = node.content;
                    }
                }
                else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                    const data = node.data;
                    if (data.indexOf(marker) >= 0) {
                        const parent = node.parentNode;
                        const strings = data.split(markerRegex);
                        const lastIndex = strings.length - 1;
                        // Generate a new text node for each literal section
                        // These nodes are also used as the markers for node parts
                        for (let i = 0; i < lastIndex; i++) {
                            let insert;
                            let s = strings[i];
                            if (s === '') {
                                insert = createMarker();
                            }
                            else {
                                const match = lastAttributeNameRegex.exec(s);
                                if (match !== null && endsWith(match[2], boundAttributeSuffix)) {
                                    s = s.slice(0, match.index) + match[1] +
                                        match[2].slice(0, -boundAttributeSuffix.length) + match[3];
                                }
                                insert = document.createTextNode(s);
                            }
                            parent.insertBefore(insert, node);
                            this.parts.push({ type: 'node', index: ++index });
                        }
                        // If there's no text, we must insert a comment to mark our place.
                        // Else, we can trust it will stick around after cloning.
                        if (strings[lastIndex] === '') {
                            parent.insertBefore(createMarker(), node);
                            nodesToRemove.push(node);
                        }
                        else {
                            node.data = strings[lastIndex];
                        }
                        // We have a part for each match found
                        partIndex += lastIndex;
                    }
                }
                else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                    if (node.data === marker) {
                        const parent = node.parentNode;
                        // Add a new marker node to be the startNode of the Part if any of
                        // the following are true:
                        //  * We don't have a previousSibling
                        //  * The previousSibling is already the start of a previous part
                        if (node.previousSibling === null || index === lastPartIndex) {
                            index++;
                            parent.insertBefore(createMarker(), node);
                        }
                        lastPartIndex = index;
                        this.parts.push({ type: 'node', index });
                        // If we don't have a nextSibling, keep this node so we have an end.
                        // Else, we can remove it to save future costs.
                        if (node.nextSibling === null) {
                            node.data = '';
                        }
                        else {
                            nodesToRemove.push(node);
                            index--;
                        }
                        partIndex++;
                    }
                    else {
                        let i = -1;
                        while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                            // Comment node has a binding marker inside, make an inactive part
                            // The binding won't work, but subsequent bindings will
                            // TODO (justinfagnani): consider whether it's even worth it to
                            // make bindings in comments work
                            this.parts.push({ type: 'node', index: -1 });
                            partIndex++;
                        }
                    }
                }
            }
            // Remove text binding nodes after the walk to not disturb the TreeWalker
            for (const n of nodesToRemove) {
                n.parentNode.removeChild(n);
            }
        }
    }
    const endsWith = (str, suffix) => {
        const index = str.length - suffix.length;
        return index >= 0 && str.slice(index) === suffix;
    };
    const isTemplatePartActive = (part) => part.index !== -1;
    // Allows `document.createComment('')` to be renamed for a
    // small manual size-savings.
    const createMarker = () => document.createComment('');
    /**
     * This regex extracts the attribute name preceding an attribute-position
     * expression. It does this by matching the syntax allowed for attributes
     * against the string literal directly preceding the expression, assuming that
     * the expression is in an attribute-value position.
     *
     * See attributes in the HTML spec:
     * https://www.w3.org/TR/html5/syntax.html#elements-attributes
     *
     * " \x09\x0a\x0c\x0d" are HTML space characters:
     * https://www.w3.org/TR/html5/infrastructure.html#space-characters
     *
     * "\0-\x1F\x7F-\x9F" are Unicode control characters, which includes every
     * space character except " ".
     *
     * So an attribute is:
     *  * The name: any character except a control character, space character, ('),
     *    ("), ">", "=", or "/"
     *  * Followed by zero or more space characters
     *  * Followed by "="
     *  * Followed by zero or more space characters
     *  * Followed by:
     *    * Any character except space, ('), ("), "<", ">", "=", (`), or
     *    * (") then any non-("), or
     *    * (') then any non-(')
     */
    const lastAttributeNameRegex = 
    // eslint-disable-next-line no-control-regex
    /([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An instance of a `Template` that can be attached to the DOM and updated
     * with new values.
     */
    class TemplateInstance {
        constructor(template, processor, options) {
            this.__parts = [];
            this.template = template;
            this.processor = processor;
            this.options = options;
        }
        update(values) {
            let i = 0;
            for (const part of this.__parts) {
                if (part !== undefined) {
                    part.setValue(values[i]);
                }
                i++;
            }
            for (const part of this.__parts) {
                if (part !== undefined) {
                    part.commit();
                }
            }
        }
        _clone() {
            // There are a number of steps in the lifecycle of a template instance's
            // DOM fragment:
            //  1. Clone - create the instance fragment
            //  2. Adopt - adopt into the main document
            //  3. Process - find part markers and create parts
            //  4. Upgrade - upgrade custom elements
            //  5. Update - set node, attribute, property, etc., values
            //  6. Connect - connect to the document. Optional and outside of this
            //     method.
            //
            // We have a few constraints on the ordering of these steps:
            //  * We need to upgrade before updating, so that property values will pass
            //    through any property setters.
            //  * We would like to process before upgrading so that we're sure that the
            //    cloned fragment is inert and not disturbed by self-modifying DOM.
            //  * We want custom elements to upgrade even in disconnected fragments.
            //
            // Given these constraints, with full custom elements support we would
            // prefer the order: Clone, Process, Adopt, Upgrade, Update, Connect
            //
            // But Safari does not implement CustomElementRegistry#upgrade, so we
            // can not implement that order and still have upgrade-before-update and
            // upgrade disconnected fragments. So we instead sacrifice the
            // process-before-upgrade constraint, since in Custom Elements v1 elements
            // must not modify their light DOM in the constructor. We still have issues
            // when co-existing with CEv0 elements like Polymer 1, and with polyfills
            // that don't strictly adhere to the no-modification rule because shadow
            // DOM, which may be created in the constructor, is emulated by being placed
            // in the light DOM.
            //
            // The resulting order is on native is: Clone, Adopt, Upgrade, Process,
            // Update, Connect. document.importNode() performs Clone, Adopt, and Upgrade
            // in one step.
            //
            // The Custom Elements v1 polyfill supports upgrade(), so the order when
            // polyfilled is the more ideal: Clone, Process, Adopt, Upgrade, Update,
            // Connect.
            const fragment = isCEPolyfill ?
                this.template.element.content.cloneNode(true) :
                document.importNode(this.template.element.content, true);
            const stack = [];
            const parts = this.template.parts;
            // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
            const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
            let partIndex = 0;
            let nodeIndex = 0;
            let part;
            let node = walker.nextNode();
            // Loop through all the nodes and parts of a template
            while (partIndex < parts.length) {
                part = parts[partIndex];
                if (!isTemplatePartActive(part)) {
                    this.__parts.push(undefined);
                    partIndex++;
                    continue;
                }
                // Progress the tree walker until we find our next part's node.
                // Note that multiple parts may share the same node (attribute parts
                // on a single element), so this loop may not run at all.
                while (nodeIndex < part.index) {
                    nodeIndex++;
                    if (node.nodeName === 'TEMPLATE') {
                        stack.push(node);
                        walker.currentNode = node.content;
                    }
                    if ((node = walker.nextNode()) === null) {
                        // We've exhausted the content inside a nested template element.
                        // Because we still have parts (the outer for-loop), we know:
                        // - There is a template in the stack
                        // - The walker will find a nextNode outside the template
                        walker.currentNode = stack.pop();
                        node = walker.nextNode();
                    }
                }
                // We've arrived at our part's node.
                if (part.type === 'node') {
                    const part = this.processor.handleTextExpression(this.options);
                    part.insertAfterNode(node.previousSibling);
                    this.__parts.push(part);
                }
                else {
                    this.__parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
                }
                partIndex++;
            }
            if (isCEPolyfill) {
                document.adoptNode(fragment);
                customElements.upgrade(fragment);
            }
            return fragment;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const commentMarker = ` ${marker} `;
    /**
     * The return type of `html`, which holds a Template and the values from
     * interpolated expressions.
     */
    class TemplateResult {
        constructor(strings, values, type, processor) {
            this.strings = strings;
            this.values = values;
            this.type = type;
            this.processor = processor;
        }
        /**
         * Returns a string of HTML used to create a `<template>` element.
         */
        getHTML() {
            const l = this.strings.length - 1;
            let html = '';
            let isCommentBinding = false;
            for (let i = 0; i < l; i++) {
                const s = this.strings[i];
                // For each binding we want to determine the kind of marker to insert
                // into the template source before it's parsed by the browser's HTML
                // parser. The marker type is based on whether the expression is in an
                // attribute, text, or comment position.
                //   * For node-position bindings we insert a comment with the marker
                //     sentinel as its text content, like <!--{{lit-guid}}-->.
                //   * For attribute bindings we insert just the marker sentinel for the
                //     first binding, so that we support unquoted attribute bindings.
                //     Subsequent bindings can use a comment marker because multi-binding
                //     attributes must be quoted.
                //   * For comment bindings we insert just the marker sentinel so we don't
                //     close the comment.
                //
                // The following code scans the template source, but is *not* an HTML
                // parser. We don't need to track the tree structure of the HTML, only
                // whether a binding is inside a comment, and if not, if it appears to be
                // the first binding in an attribute.
                const commentOpen = s.lastIndexOf('<!--');
                // We're in comment position if we have a comment open with no following
                // comment close. Because <-- can appear in an attribute value there can
                // be false positives.
                isCommentBinding = (commentOpen > -1 || isCommentBinding) &&
                    s.indexOf('-->', commentOpen + 1) === -1;
                // Check to see if we have an attribute-like sequence preceding the
                // expression. This can match "name=value" like structures in text,
                // comments, and attribute values, so there can be false-positives.
                const attributeMatch = lastAttributeNameRegex.exec(s);
                if (attributeMatch === null) {
                    // We're only in this branch if we don't have a attribute-like
                    // preceding sequence. For comments, this guards against unusual
                    // attribute values like <div foo="<!--${'bar'}">. Cases like
                    // <!-- foo=${'bar'}--> are handled correctly in the attribute branch
                    // below.
                    html += s + (isCommentBinding ? commentMarker : nodeMarker);
                }
                else {
                    // For attributes we use just a marker sentinel, and also append a
                    // $lit$ suffix to the name to opt-out of attribute-specific parsing
                    // that IE and Edge do for style and certain SVG attributes.
                    html += s.substr(0, attributeMatch.index) + attributeMatch[1] +
                        attributeMatch[2] + boundAttributeSuffix + attributeMatch[3] +
                        marker;
                }
            }
            html += this.strings[l];
            return html;
        }
        getTemplateElement() {
            const template = document.createElement('template');
            template.innerHTML = this.getHTML();
            return template;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const isPrimitive = (value) => {
        return (value === null ||
            !(typeof value === 'object' || typeof value === 'function'));
    };
    const isIterable = (value) => {
        return Array.isArray(value) ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            !!(value && value[Symbol.iterator]);
    };
    /**
     * Writes attribute values to the DOM for a group of AttributeParts bound to a
     * single attribute. The value is only set once even if there are multiple parts
     * for an attribute.
     */
    class AttributeCommitter {
        constructor(element, name, strings) {
            this.dirty = true;
            this.element = element;
            this.name = name;
            this.strings = strings;
            this.parts = [];
            for (let i = 0; i < strings.length - 1; i++) {
                this.parts[i] = this._createPart();
            }
        }
        /**
         * Creates a single part. Override this to create a differnt type of part.
         */
        _createPart() {
            return new AttributePart(this);
        }
        _getValue() {
            const strings = this.strings;
            const l = strings.length - 1;
            let text = '';
            for (let i = 0; i < l; i++) {
                text += strings[i];
                const part = this.parts[i];
                if (part !== undefined) {
                    const v = part.value;
                    if (isPrimitive(v) || !isIterable(v)) {
                        text += typeof v === 'string' ? v : String(v);
                    }
                    else {
                        for (const t of v) {
                            text += typeof t === 'string' ? t : String(t);
                        }
                    }
                }
            }
            text += strings[l];
            return text;
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                this.element.setAttribute(this.name, this._getValue());
            }
        }
    }
    /**
     * A Part that controls all or part of an attribute value.
     */
    class AttributePart {
        constructor(committer) {
            this.value = undefined;
            this.committer = committer;
        }
        setValue(value) {
            if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
                this.value = value;
                // If the value is a not a directive, dirty the committer so that it'll
                // call setAttribute. If the value is a directive, it'll dirty the
                // committer if it calls setValue().
                if (!isDirective(value)) {
                    this.committer.dirty = true;
                }
            }
        }
        commit() {
            while (isDirective(this.value)) {
                const directive = this.value;
                this.value = noChange;
                directive(this);
            }
            if (this.value === noChange) {
                return;
            }
            this.committer.commit();
        }
    }
    /**
     * A Part that controls a location within a Node tree. Like a Range, NodePart
     * has start and end locations and can set and update the Nodes between those
     * locations.
     *
     * NodeParts support several value types: primitives, Nodes, TemplateResults,
     * as well as arrays and iterables of those types.
     */
    class NodePart {
        constructor(options) {
            this.value = undefined;
            this.__pendingValue = undefined;
            this.options = options;
        }
        /**
         * Appends this part into a container.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendInto(container) {
            this.startNode = container.appendChild(createMarker());
            this.endNode = container.appendChild(createMarker());
        }
        /**
         * Inserts this part after the `ref` node (between `ref` and `ref`'s next
         * sibling). Both `ref` and its next sibling must be static, unchanging nodes
         * such as those that appear in a literal section of a template.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterNode(ref) {
            this.startNode = ref;
            this.endNode = ref.nextSibling;
        }
        /**
         * Appends this part into a parent part.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendIntoPart(part) {
            part.__insert(this.startNode = createMarker());
            part.__insert(this.endNode = createMarker());
        }
        /**
         * Inserts this part after the `ref` part.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterPart(ref) {
            ref.__insert(this.startNode = createMarker());
            this.endNode = ref.endNode;
            ref.endNode = this.startNode;
        }
        setValue(value) {
            this.__pendingValue = value;
        }
        commit() {
            if (this.startNode.parentNode === null) {
                return;
            }
            while (isDirective(this.__pendingValue)) {
                const directive = this.__pendingValue;
                this.__pendingValue = noChange;
                directive(this);
            }
            const value = this.__pendingValue;
            if (value === noChange) {
                return;
            }
            if (isPrimitive(value)) {
                if (value !== this.value) {
                    this.__commitText(value);
                }
            }
            else if (value instanceof TemplateResult) {
                this.__commitTemplateResult(value);
            }
            else if (value instanceof Node) {
                this.__commitNode(value);
            }
            else if (isIterable(value)) {
                this.__commitIterable(value);
            }
            else if (value === nothing) {
                this.value = nothing;
                this.clear();
            }
            else {
                // Fallback, will render the string representation
                this.__commitText(value);
            }
        }
        __insert(node) {
            this.endNode.parentNode.insertBefore(node, this.endNode);
        }
        __commitNode(value) {
            if (this.value === value) {
                return;
            }
            this.clear();
            this.__insert(value);
            this.value = value;
        }
        __commitText(value) {
            const node = this.startNode.nextSibling;
            value = value == null ? '' : value;
            // If `value` isn't already a string, we explicitly convert it here in case
            // it can't be implicitly converted - i.e. it's a symbol.
            const valueAsString = typeof value === 'string' ? value : String(value);
            if (node === this.endNode.previousSibling &&
                node.nodeType === 3 /* Node.TEXT_NODE */) {
                // If we only have a single text node between the markers, we can just
                // set its value, rather than replacing it.
                // TODO(justinfagnani): Can we just check if this.value is primitive?
                node.data = valueAsString;
            }
            else {
                this.__commitNode(document.createTextNode(valueAsString));
            }
            this.value = value;
        }
        __commitTemplateResult(value) {
            const template = this.options.templateFactory(value);
            if (this.value instanceof TemplateInstance &&
                this.value.template === template) {
                this.value.update(value.values);
            }
            else {
                // Make sure we propagate the template processor from the TemplateResult
                // so that we use its syntax extension, etc. The template factory comes
                // from the render function options so that it can control template
                // caching and preprocessing.
                const instance = new TemplateInstance(template, value.processor, this.options);
                const fragment = instance._clone();
                instance.update(value.values);
                this.__commitNode(fragment);
                this.value = instance;
            }
        }
        __commitIterable(value) {
            // For an Iterable, we create a new InstancePart per item, then set its
            // value to the item. This is a little bit of overhead for every item in
            // an Iterable, but it lets us recurse easily and efficiently update Arrays
            // of TemplateResults that will be commonly returned from expressions like:
            // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
            // If _value is an array, then the previous render was of an
            // iterable and _value will contain the NodeParts from the previous
            // render. If _value is not an array, clear this part and make a new
            // array for NodeParts.
            if (!Array.isArray(this.value)) {
                this.value = [];
                this.clear();
            }
            // Lets us keep track of how many items we stamped so we can clear leftover
            // items from a previous render
            const itemParts = this.value;
            let partIndex = 0;
            let itemPart;
            for (const item of value) {
                // Try to reuse an existing part
                itemPart = itemParts[partIndex];
                // If no existing part, create a new one
                if (itemPart === undefined) {
                    itemPart = new NodePart(this.options);
                    itemParts.push(itemPart);
                    if (partIndex === 0) {
                        itemPart.appendIntoPart(this);
                    }
                    else {
                        itemPart.insertAfterPart(itemParts[partIndex - 1]);
                    }
                }
                itemPart.setValue(item);
                itemPart.commit();
                partIndex++;
            }
            if (partIndex < itemParts.length) {
                // Truncate the parts array so _value reflects the current state
                itemParts.length = partIndex;
                this.clear(itemPart && itemPart.endNode);
            }
        }
        clear(startNode = this.startNode) {
            removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
        }
    }
    /**
     * Implements a boolean attribute, roughly as defined in the HTML
     * specification.
     *
     * If the value is truthy, then the attribute is present with a value of
     * ''. If the value is falsey, the attribute is removed.
     */
    class BooleanAttributePart {
        constructor(element, name, strings) {
            this.value = undefined;
            this.__pendingValue = undefined;
            if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
                throw new Error('Boolean attributes can only contain a single expression');
            }
            this.element = element;
            this.name = name;
            this.strings = strings;
        }
        setValue(value) {
            this.__pendingValue = value;
        }
        commit() {
            while (isDirective(this.__pendingValue)) {
                const directive = this.__pendingValue;
                this.__pendingValue = noChange;
                directive(this);
            }
            if (this.__pendingValue === noChange) {
                return;
            }
            const value = !!this.__pendingValue;
            if (this.value !== value) {
                if (value) {
                    this.element.setAttribute(this.name, '');
                }
                else {
                    this.element.removeAttribute(this.name);
                }
                this.value = value;
            }
            this.__pendingValue = noChange;
        }
    }
    /**
     * Sets attribute values for PropertyParts, so that the value is only set once
     * even if there are multiple parts for a property.
     *
     * If an expression controls the whole property value, then the value is simply
     * assigned to the property under control. If there are string literals or
     * multiple expressions, then the strings are expressions are interpolated into
     * a string first.
     */
    class PropertyCommitter extends AttributeCommitter {
        constructor(element, name, strings) {
            super(element, name, strings);
            this.single =
                (strings.length === 2 && strings[0] === '' && strings[1] === '');
        }
        _createPart() {
            return new PropertyPart(this);
        }
        _getValue() {
            if (this.single) {
                return this.parts[0].value;
            }
            return super._getValue();
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.element[this.name] = this._getValue();
            }
        }
    }
    class PropertyPart extends AttributePart {
    }
    // Detect event listener options support. If the `capture` property is read
    // from the options object, then options are supported. If not, then the third
    // argument to add/removeEventListener is interpreted as the boolean capture
    // value so we should only pass the `capture` property.
    let eventOptionsSupported = false;
    // Wrap into an IIFE because MS Edge <= v41 does not support having try/catch
    // blocks right into the body of a module
    (() => {
        try {
            const options = {
                get capture() {
                    eventOptionsSupported = true;
                    return false;
                }
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.addEventListener('test', options, options);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.removeEventListener('test', options, options);
        }
        catch (_e) {
            // event options not supported
        }
    })();
    class EventPart {
        constructor(element, eventName, eventContext) {
            this.value = undefined;
            this.__pendingValue = undefined;
            this.element = element;
            this.eventName = eventName;
            this.eventContext = eventContext;
            this.__boundHandleEvent = (e) => this.handleEvent(e);
        }
        setValue(value) {
            this.__pendingValue = value;
        }
        commit() {
            while (isDirective(this.__pendingValue)) {
                const directive = this.__pendingValue;
                this.__pendingValue = noChange;
                directive(this);
            }
            if (this.__pendingValue === noChange) {
                return;
            }
            const newListener = this.__pendingValue;
            const oldListener = this.value;
            const shouldRemoveListener = newListener == null ||
                oldListener != null &&
                    (newListener.capture !== oldListener.capture ||
                        newListener.once !== oldListener.once ||
                        newListener.passive !== oldListener.passive);
            const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
            if (shouldRemoveListener) {
                this.element.removeEventListener(this.eventName, this.__boundHandleEvent, this.__options);
            }
            if (shouldAddListener) {
                this.__options = getOptions(newListener);
                this.element.addEventListener(this.eventName, this.__boundHandleEvent, this.__options);
            }
            this.value = newListener;
            this.__pendingValue = noChange;
        }
        handleEvent(event) {
            if (typeof this.value === 'function') {
                this.value.call(this.eventContext || this.element, event);
            }
            else {
                this.value.handleEvent(event);
            }
        }
    }
    // We copy options because of the inconsistent behavior of browsers when reading
    // the third argument of add/removeEventListener. IE11 doesn't support options
    // at all. Chrome 41 only reads `capture` if the argument is an object.
    const getOptions = (o) => o &&
        (eventOptionsSupported ?
            { capture: o.capture, passive: o.passive, once: o.once } :
            o.capture);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * Creates Parts when a template is instantiated.
     */
    class DefaultTemplateProcessor {
        /**
         * Create parts for an attribute-position binding, given the event, attribute
         * name, and string literals.
         *
         * @param element The element containing the binding
         * @param name  The attribute name
         * @param strings The string literals. There are always at least two strings,
         *   event for fully-controlled bindings with a single expression.
         */
        handleAttributeExpressions(element, name, strings, options) {
            const prefix = name[0];
            if (prefix === '.') {
                const committer = new PropertyCommitter(element, name.slice(1), strings);
                return committer.parts;
            }
            if (prefix === '@') {
                return [new EventPart(element, name.slice(1), options.eventContext)];
            }
            if (prefix === '?') {
                return [new BooleanAttributePart(element, name.slice(1), strings)];
            }
            const committer = new AttributeCommitter(element, name, strings);
            return committer.parts;
        }
        /**
         * Create parts for a text-position binding.
         * @param templateFactory
         */
        handleTextExpression(options) {
            return new NodePart(options);
        }
    }
    const defaultTemplateProcessor = new DefaultTemplateProcessor();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * The default TemplateFactory which caches Templates keyed on
     * result.type and result.strings.
     */
    function templateFactory(result) {
        let templateCache = templateCaches.get(result.type);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(result.type, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        // If the TemplateStringsArray is new, generate a key from the strings
        // This key is shared between all templates with identical content
        const key = result.strings.join(marker);
        // Check if we already have a Template for this key
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            // If we have not seen this key before, create a new Template
            template = new Template(result, result.getTemplateElement());
            // Cache the Template for this key
            templateCache.keyString.set(key, template);
        }
        // Cache all future queries for this TemplateStringsArray
        templateCache.stringsArray.set(result.strings, template);
        return template;
    }
    const templateCaches = new Map();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const parts = new WeakMap();
    /**
     * Renders a template result or other value to a container.
     *
     * To update a container with new values, reevaluate the template literal and
     * call `render` with the new result.
     *
     * @param result Any value renderable by NodePart - typically a TemplateResult
     *     created by evaluating a template tag like `html` or `svg`.
     * @param container A DOM parent to render to. The entire contents are either
     *     replaced, or efficiently updated if the same result type was previous
     *     rendered there.
     * @param options RenderOptions for the entire render tree rendered to this
     *     container. Render options must *not* change between renders to the same
     *     container, as those changes will not effect previously rendered DOM.
     */
    const render = (result, container, options) => {
        let part = parts.get(container);
        if (part === undefined) {
            removeNodes(container, container.firstChild);
            parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
            part.appendInto(container);
        }
        part.setValue(result);
        part.commit();
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for lit-html usage.
    // TODO(justinfagnani): inject version number at build time
    if (typeof window !== 'undefined') {
        (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.2.1');
    }
    /**
     * Interprets a template literal as an HTML template that can efficiently
     * render to and update a container.
     */
    const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

    /** MobX - (c) Michel Weststrate 2015 - 2020 - MIT Licensed */
    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __values(o) {
        var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
        if (m) return m.call(o);
        return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
    }

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    var OBFUSCATED_ERROR = "An invariant failed, however the error is obfuscated because this is a production build.";
    var EMPTY_ARRAY = [];
    Object.freeze(EMPTY_ARRAY);
    var EMPTY_OBJECT = {};
    Object.freeze(EMPTY_OBJECT);
    function getNextId() {
        return ++globalState.mobxGuid;
    }
    function fail$1(message) {
        invariant(false, message);
        throw "X"; // unreachable
    }
    function invariant(check, message) {
        if (!check)
            throw new Error("[mobx] " + (message || OBFUSCATED_ERROR));
    }
    /**
     * Makes sure that the provided function is invoked at most once.
     */
    function once(func) {
        var invoked = false;
        return function () {
            if (invoked)
                return;
            invoked = true;
            return func.apply(this, arguments);
        };
    }
    var noop = function () { };
    function unique(list) {
        var res = [];
        list.forEach(function (item) {
            if (res.indexOf(item) === -1)
                res.push(item);
        });
        return res;
    }
    function isObject(value) {
        return value !== null && typeof value === "object";
    }
    function isPlainObject(value) {
        if (value === null || typeof value !== "object")
            return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }
    function addHiddenProp(object, propName, value) {
        Object.defineProperty(object, propName, {
            enumerable: false,
            writable: true,
            configurable: true,
            value: value
        });
    }
    function addHiddenFinalProp(object, propName, value) {
        Object.defineProperty(object, propName, {
            enumerable: false,
            writable: false,
            configurable: true,
            value: value
        });
    }
    function isPropertyConfigurable(object, prop) {
        var descriptor = Object.getOwnPropertyDescriptor(object, prop);
        return !descriptor || (descriptor.configurable !== false && descriptor.writable !== false);
    }
    function assertPropertyConfigurable(object, prop) {
        if (process.env.NODE_ENV !== "production" && !isPropertyConfigurable(object, prop))
            fail$1("Cannot make property '" + prop.toString() + "' observable, it is not configurable and writable in the target object");
    }
    function createInstanceofPredicate(name, clazz) {
        var propName = "isMobX" + name;
        clazz.prototype[propName] = true;
        return function (x) {
            return isObject(x) && x[propName] === true;
        };
    }
    function isES6Map(thing) {
        return thing instanceof Map;
    }
    function isES6Set(thing) {
        return thing instanceof Set;
    }
    /**
     * Returns the following: own keys, prototype keys & own symbol keys, if they are enumerable.
     */
    function getPlainObjectKeys(object) {
        var enumerables = new Set();
        for (var key in object)
            enumerables.add(key); // *all* enumerables
        Object.getOwnPropertySymbols(object).forEach(function (k) {
            if (Object.getOwnPropertyDescriptor(object, k).enumerable)
                enumerables.add(k);
        }); // *own* symbols
        // Note: this implementation is missing enumerable, inherited, symbolic property names! That would however pretty expensive to add,
        // as there is no efficient iterator that returns *all* properties
        return Array.from(enumerables);
    }
    function stringifyKey(key) {
        if (key && key.toString)
            return key.toString();
        else
            return new String(key).toString();
    }
    function getMapLikeKeys(map) {
        if (isPlainObject(map))
            return Object.keys(map);
        if (Array.isArray(map))
            return map.map(function (_a) {
                var _b = __read(_a, 1), key = _b[0];
                return key;
            });
        if (isES6Map(map) || isObservableMap(map))
            return Array.from(map.keys());
        return fail$1("Cannot get keys from '" + map + "'");
    }
    function toPrimitive(value) {
        return value === null ? null : typeof value === "object" ? "" + value : value;
    }

    var $mobx = Symbol("mobx administration");
    var Atom = /** @class */ (function () {
        /**
         * Create a new atom. For debugging purposes it is recommended to give it a name.
         * The onBecomeObserved and onBecomeUnobserved callbacks can be used for resource management.
         */
        function Atom(name) {
            if (name === void 0) { name = "Atom@" + getNextId(); }
            this.name = name;
            this.isPendingUnobservation = false; // for effective unobserving. BaseAtom has true, for extra optimization, so its onBecomeUnobserved never gets called, because it's not needed
            this.isBeingObserved = false;
            this.observers = new Set();
            this.diffValue = 0;
            this.lastAccessedBy = 0;
            this.lowestObserverState = IDerivationState.NOT_TRACKING;
        }
        Atom.prototype.onBecomeObserved = function () {
            if (this.onBecomeObservedListeners) {
                this.onBecomeObservedListeners.forEach(function (listener) { return listener(); });
            }
        };
        Atom.prototype.onBecomeUnobserved = function () {
            if (this.onBecomeUnobservedListeners) {
                this.onBecomeUnobservedListeners.forEach(function (listener) { return listener(); });
            }
        };
        /**
         * Invoke this method to notify mobx that your atom has been used somehow.
         * Returns true if there is currently a reactive context.
         */
        Atom.prototype.reportObserved = function () {
            return reportObserved(this);
        };
        /**
         * Invoke this method _after_ this method has changed to signal mobx that all its observers should invalidate.
         */
        Atom.prototype.reportChanged = function () {
            startBatch();
            propagateChanged(this);
            endBatch();
        };
        Atom.prototype.toString = function () {
            return this.name;
        };
        return Atom;
    }());
    var isAtom = createInstanceofPredicate("Atom", Atom);
    function createAtom(name, onBecomeObservedHandler, onBecomeUnobservedHandler) {
        if (onBecomeObservedHandler === void 0) { onBecomeObservedHandler = noop; }
        if (onBecomeUnobservedHandler === void 0) { onBecomeUnobservedHandler = noop; }
        var atom = new Atom(name);
        // default `noop` listener will not initialize the hook Set
        if (onBecomeObservedHandler !== noop) {
            onBecomeObserved(atom, onBecomeObservedHandler);
        }
        if (onBecomeUnobservedHandler !== noop) {
            onBecomeUnobserved(atom, onBecomeUnobservedHandler);
        }
        return atom;
    }

    function identityComparer(a, b) {
        return a === b;
    }
    function structuralComparer(a, b) {
        return deepEqual(a, b);
    }
    function shallowComparer(a, b) {
        return deepEqual(a, b, 1);
    }
    function defaultComparer(a, b) {
        return Object.is(a, b);
    }
    var comparer = {
        identity: identityComparer,
        structural: structuralComparer,
        default: defaultComparer,
        shallow: shallowComparer
    };

    var mobxDidRunLazyInitializersSymbol = Symbol("mobx did run lazy initializers");
    var mobxPendingDecorators = Symbol("mobx pending decorators");
    var enumerableDescriptorCache = {};
    var nonEnumerableDescriptorCache = {};
    function createPropertyInitializerDescriptor(prop, enumerable) {
        var cache = enumerable ? enumerableDescriptorCache : nonEnumerableDescriptorCache;
        return (cache[prop] ||
            (cache[prop] = {
                configurable: true,
                enumerable: enumerable,
                get: function () {
                    initializeInstance(this);
                    return this[prop];
                },
                set: function (value) {
                    initializeInstance(this);
                    this[prop] = value;
                }
            }));
    }
    function initializeInstance(target) {
        var e_1, _a;
        if (target[mobxDidRunLazyInitializersSymbol] === true)
            return;
        var decorators = target[mobxPendingDecorators];
        if (decorators) {
            addHiddenProp(target, mobxDidRunLazyInitializersSymbol, true);
            // Build property key array from both strings and symbols
            var keys = __spread(Object.getOwnPropertySymbols(decorators), Object.keys(decorators));
            try {
                for (var keys_1 = __values(keys), keys_1_1 = keys_1.next(); !keys_1_1.done; keys_1_1 = keys_1.next()) {
                    var key = keys_1_1.value;
                    var d = decorators[key];
                    d.propertyCreator(target, d.prop, d.descriptor, d.decoratorTarget, d.decoratorArguments);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (keys_1_1 && !keys_1_1.done && (_a = keys_1.return)) _a.call(keys_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
    }
    function createPropDecorator(propertyInitiallyEnumerable, propertyCreator) {
        return function decoratorFactory() {
            var decoratorArguments;
            var decorator = function decorate(target, prop, descriptor, applyImmediately
            // This is a special parameter to signal the direct application of a decorator, allow extendObservable to skip the entire type decoration part,
            // as the instance to apply the decorator to equals the target
            ) {
                if (applyImmediately === true) {
                    propertyCreator(target, prop, descriptor, target, decoratorArguments);
                    return null;
                }
                if (process.env.NODE_ENV !== "production" && !quacksLikeADecorator(arguments))
                    fail$1("This function is a decorator, but it wasn't invoked like a decorator");
                if (!Object.prototype.hasOwnProperty.call(target, mobxPendingDecorators)) {
                    var inheritedDecorators = target[mobxPendingDecorators];
                    addHiddenProp(target, mobxPendingDecorators, __assign({}, inheritedDecorators));
                }
                target[mobxPendingDecorators][prop] = {
                    prop: prop,
                    propertyCreator: propertyCreator,
                    descriptor: descriptor,
                    decoratorTarget: target,
                    decoratorArguments: decoratorArguments
                };
                return createPropertyInitializerDescriptor(prop, propertyInitiallyEnumerable);
            };
            if (quacksLikeADecorator(arguments)) {
                // @decorator
                decoratorArguments = EMPTY_ARRAY;
                return decorator.apply(null, arguments);
            }
            else {
                // @decorator(args)
                decoratorArguments = Array.prototype.slice.call(arguments);
                return decorator;
            }
        };
    }
    function quacksLikeADecorator(args) {
        return (((args.length === 2 || args.length === 3) &&
            (typeof args[1] === "string" || typeof args[1] === "symbol")) ||
            (args.length === 4 && args[3] === true));
    }

    function deepEnhancer(v, _, name) {
        // it is an observable already, done
        if (isObservable(v))
            return v;
        // something that can be converted and mutated?
        if (Array.isArray(v))
            return observable.array(v, { name: name });
        if (isPlainObject(v))
            return observable.object(v, undefined, { name: name });
        if (isES6Map(v))
            return observable.map(v, { name: name });
        if (isES6Set(v))
            return observable.set(v, { name: name });
        return v;
    }
    function shallowEnhancer(v, _, name) {
        if (v === undefined || v === null)
            return v;
        if (isObservableObject(v) || isObservableArray(v) || isObservableMap(v) || isObservableSet(v))
            return v;
        if (Array.isArray(v))
            return observable.array(v, { name: name, deep: false });
        if (isPlainObject(v))
            return observable.object(v, undefined, { name: name, deep: false });
        if (isES6Map(v))
            return observable.map(v, { name: name, deep: false });
        if (isES6Set(v))
            return observable.set(v, { name: name, deep: false });
        return fail$1(process.env.NODE_ENV !== "production" &&
            "The shallow modifier / decorator can only used in combination with arrays, objects, maps and sets");
    }
    function referenceEnhancer(newValue) {
        // never turn into an observable
        return newValue;
    }
    function refStructEnhancer(v, oldValue, name) {
        if (process.env.NODE_ENV !== "production" && isObservable(v))
            throw "observable.struct should not be used with observable values";
        if (deepEqual(v, oldValue))
            return oldValue;
        return v;
    }

    function createDecoratorForEnhancer(enhancer) {
        invariant(enhancer);
        var decorator = createPropDecorator(true, function (target, propertyName, descriptor, _decoratorTarget, decoratorArgs) {
            if (process.env.NODE_ENV !== "production") {
                invariant(!descriptor || !descriptor.get, "@observable cannot be used on getter (property \"" + stringifyKey(propertyName) + "\"), use @computed instead.");
            }
            var initialValue = descriptor
                ? descriptor.initializer
                    ? descriptor.initializer.call(target)
                    : descriptor.value
                : undefined;
            asObservableObject(target).addObservableProp(propertyName, initialValue, enhancer);
        });
        var res = 
        // Extra process checks, as this happens during module initialization
        typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production"
            ? function observableDecorator() {
                // This wrapper function is just to detect illegal decorator invocations, deprecate in a next version
                // and simply return the created prop decorator
                if (arguments.length < 2)
                    return fail$1("Incorrect decorator invocation. @observable decorator doesn't expect any arguments");
                return decorator.apply(null, arguments);
            }
            : decorator;
        res.enhancer = enhancer;
        return res;
    }

    // Predefined bags of create observable options, to avoid allocating temporarily option objects
    // in the majority of cases
    var defaultCreateObservableOptions = {
        deep: true,
        name: undefined,
        defaultDecorator: undefined,
        proxy: true
    };
    Object.freeze(defaultCreateObservableOptions);
    function assertValidOption(key) {
        if (!/^(deep|name|equals|defaultDecorator|proxy)$/.test(key))
            fail$1("invalid option for (extend)observable: " + key);
    }
    function asCreateObservableOptions(thing) {
        if (thing === null || thing === undefined)
            return defaultCreateObservableOptions;
        if (typeof thing === "string")
            return { name: thing, deep: true, proxy: true };
        if (process.env.NODE_ENV !== "production") {
            if (typeof thing !== "object")
                return fail$1("expected options object");
            Object.keys(thing).forEach(assertValidOption);
        }
        return thing;
    }
    var deepDecorator = createDecoratorForEnhancer(deepEnhancer);
    var shallowDecorator = createDecoratorForEnhancer(shallowEnhancer);
    var refDecorator = createDecoratorForEnhancer(referenceEnhancer);
    var refStructDecorator = createDecoratorForEnhancer(refStructEnhancer);
    function getEnhancerFromOptions(options) {
        return options.defaultDecorator
            ? options.defaultDecorator.enhancer
            : options.deep === false
                ? referenceEnhancer
                : deepEnhancer;
    }
    /**
     * Turns an object, array or function into a reactive structure.
     * @param v the value which should become observable.
     */
    function createObservable(v, arg2, arg3) {
        // @observable someProp;
        if (typeof arguments[1] === "string" || typeof arguments[1] === "symbol") {
            return deepDecorator.apply(null, arguments);
        }
        // it is an observable already, done
        if (isObservable(v))
            return v;
        // something that can be converted and mutated?
        var res = isPlainObject(v)
            ? observable.object(v, arg2, arg3)
            : Array.isArray(v)
                ? observable.array(v, arg2)
                : isES6Map(v)
                    ? observable.map(v, arg2)
                    : isES6Set(v)
                        ? observable.set(v, arg2)
                        : v;
        // this value could be converted to a new observable data structure, return it
        if (res !== v)
            return res;
        // otherwise, just box it
        fail$1(process.env.NODE_ENV !== "production" &&
            "The provided value could not be converted into an observable. If you want just create an observable reference to the object use 'observable.box(value)'");
    }
    var observableFactories = {
        box: function (value, options) {
            if (arguments.length > 2)
                incorrectlyUsedAsDecorator("box");
            var o = asCreateObservableOptions(options);
            return new ObservableValue(value, getEnhancerFromOptions(o), o.name, true, o.equals);
        },
        array: function (initialValues, options) {
            if (arguments.length > 2)
                incorrectlyUsedAsDecorator("array");
            var o = asCreateObservableOptions(options);
            return createObservableArray(initialValues, getEnhancerFromOptions(o), o.name);
        },
        map: function (initialValues, options) {
            if (arguments.length > 2)
                incorrectlyUsedAsDecorator("map");
            var o = asCreateObservableOptions(options);
            return new ObservableMap(initialValues, getEnhancerFromOptions(o), o.name);
        },
        set: function (initialValues, options) {
            if (arguments.length > 2)
                incorrectlyUsedAsDecorator("set");
            var o = asCreateObservableOptions(options);
            return new ObservableSet(initialValues, getEnhancerFromOptions(o), o.name);
        },
        object: function (props, decorators, options) {
            if (typeof arguments[1] === "string")
                incorrectlyUsedAsDecorator("object");
            var o = asCreateObservableOptions(options);
            if (o.proxy === false) {
                return extendObservable({}, props, decorators, o);
            }
            else {
                var defaultDecorator = getDefaultDecoratorFromObjectOptions(o);
                var base = extendObservable({}, undefined, undefined, o);
                var proxy = createDynamicObservableObject(base);
                extendObservableObjectWithProperties(proxy, props, decorators, defaultDecorator);
                return proxy;
            }
        },
        ref: refDecorator,
        shallow: shallowDecorator,
        deep: deepDecorator,
        struct: refStructDecorator
    };
    var observable = createObservable;
    // weird trick to keep our typings nicely with our funcs, and still extend the observable function
    Object.keys(observableFactories).forEach(function (name) { return (observable[name] = observableFactories[name]); });
    function incorrectlyUsedAsDecorator(methodName) {
        fail$1(
        // process.env.NODE_ENV !== "production" &&
        "Expected one or two arguments to observable." + methodName + ". Did you accidentally try to use observable." + methodName + " as decorator?");
    }

    var computedDecorator = createPropDecorator(false, function (instance, propertyName, descriptor, decoratorTarget, decoratorArgs) {
        var get = descriptor.get, set = descriptor.set; // initialValue is the descriptor for get / set props
        // Optimization: faster on decorator target or instance? Assuming target
        // Optimization: find out if declaring on instance isn't just faster. (also makes the property descriptor simpler). But, more memory usage..
        // Forcing instance now, fixes hot reloadig issues on React Native:
        var options = decoratorArgs[0] || {};
        asObservableObject(instance).addComputedProp(instance, propertyName, __assign({ get: get,
            set: set, context: instance }, options));
    });
    var computedStructDecorator = computedDecorator({ equals: comparer.structural });
    /**
     * Decorator for class properties: @computed get value() { return expr; }.
     * For legacy purposes also invokable as ES5 observable created: `computed(() => expr)`;
     */
    var computed = function computed(arg1, arg2, arg3) {
        if (typeof arg2 === "string") {
            // @computed
            return computedDecorator.apply(null, arguments);
        }
        if (arg1 !== null && typeof arg1 === "object" && arguments.length === 1) {
            // @computed({ options })
            return computedDecorator.apply(null, arguments);
        }
        // computed(expr, options?)
        if (process.env.NODE_ENV !== "production") {
            invariant(typeof arg1 === "function", "First argument to `computed` should be an expression.");
            invariant(arguments.length < 3, "Computed takes one or two arguments if used as function");
        }
        var opts = typeof arg2 === "object" ? arg2 : {};
        opts.get = arg1;
        opts.set = typeof arg2 === "function" ? arg2 : opts.set;
        opts.name = opts.name || arg1.name || ""; /* for generated name */
        return new ComputedValue(opts);
    };
    computed.struct = computedStructDecorator;

    var IDerivationState;
    (function (IDerivationState) {
        // before being run or (outside batch and not being observed)
        // at this point derivation is not holding any data about dependency tree
        IDerivationState[IDerivationState["NOT_TRACKING"] = -1] = "NOT_TRACKING";
        // no shallow dependency changed since last computation
        // won't recalculate derivation
        // this is what makes mobx fast
        IDerivationState[IDerivationState["UP_TO_DATE"] = 0] = "UP_TO_DATE";
        // some deep dependency changed, but don't know if shallow dependency changed
        // will require to check first if UP_TO_DATE or POSSIBLY_STALE
        // currently only ComputedValue will propagate POSSIBLY_STALE
        //
        // having this state is second big optimization:
        // don't have to recompute on every dependency change, but only when it's needed
        IDerivationState[IDerivationState["POSSIBLY_STALE"] = 1] = "POSSIBLY_STALE";
        // A shallow dependency has changed since last computation and the derivation
        // will need to recompute when it's needed next.
        IDerivationState[IDerivationState["STALE"] = 2] = "STALE";
    })(IDerivationState || (IDerivationState = {}));
    var TraceMode;
    (function (TraceMode) {
        TraceMode[TraceMode["NONE"] = 0] = "NONE";
        TraceMode[TraceMode["LOG"] = 1] = "LOG";
        TraceMode[TraceMode["BREAK"] = 2] = "BREAK";
    })(TraceMode || (TraceMode = {}));
    var CaughtException = /** @class */ (function () {
        function CaughtException(cause) {
            this.cause = cause;
            // Empty
        }
        return CaughtException;
    }());
    function isCaughtException(e) {
        return e instanceof CaughtException;
    }
    /**
     * Finds out whether any dependency of the derivation has actually changed.
     * If dependenciesState is 1 then it will recalculate dependencies,
     * if any dependency changed it will propagate it by changing dependenciesState to 2.
     *
     * By iterating over the dependencies in the same order that they were reported and
     * stopping on the first change, all the recalculations are only called for ComputedValues
     * that will be tracked by derivation. That is because we assume that if the first x
     * dependencies of the derivation doesn't change then the derivation should run the same way
     * up until accessing x-th dependency.
     */
    function shouldCompute(derivation) {
        switch (derivation.dependenciesState) {
            case IDerivationState.UP_TO_DATE:
                return false;
            case IDerivationState.NOT_TRACKING:
            case IDerivationState.STALE:
                return true;
            case IDerivationState.POSSIBLY_STALE: {
                // state propagation can occur outside of action/reactive context #2195
                var prevAllowStateReads = allowStateReadsStart(true);
                var prevUntracked = untrackedStart(); // no need for those computeds to be reported, they will be picked up in trackDerivedFunction.
                var obs = derivation.observing, l = obs.length;
                for (var i = 0; i < l; i++) {
                    var obj = obs[i];
                    if (isComputedValue(obj)) {
                        if (globalState.disableErrorBoundaries) {
                            obj.get();
                        }
                        else {
                            try {
                                obj.get();
                            }
                            catch (e) {
                                // we are not interested in the value *or* exception at this moment, but if there is one, notify all
                                untrackedEnd(prevUntracked);
                                allowStateReadsEnd(prevAllowStateReads);
                                return true;
                            }
                        }
                        // if ComputedValue `obj` actually changed it will be computed and propagated to its observers.
                        // and `derivation` is an observer of `obj`
                        // invariantShouldCompute(derivation)
                        if (derivation.dependenciesState === IDerivationState.STALE) {
                            untrackedEnd(prevUntracked);
                            allowStateReadsEnd(prevAllowStateReads);
                            return true;
                        }
                    }
                }
                changeDependenciesStateTo0(derivation);
                untrackedEnd(prevUntracked);
                allowStateReadsEnd(prevAllowStateReads);
                return false;
            }
        }
    }
    function checkIfStateModificationsAreAllowed(atom) {
        var hasObservers = atom.observers.size > 0;
        // Should never be possible to change an observed observable from inside computed, see #798
        if (globalState.computationDepth > 0 && hasObservers)
            fail$1(process.env.NODE_ENV !== "production" &&
                "Computed values are not allowed to cause side effects by changing observables that are already being observed. Tried to modify: " + atom.name);
        // Should not be possible to change observed state outside strict mode, except during initialization, see #563
        if (!globalState.allowStateChanges && (hasObservers || globalState.enforceActions === "strict"))
            fail$1(process.env.NODE_ENV !== "production" &&
                (globalState.enforceActions
                    ? "Since strict-mode is enabled, changing observed observable values outside actions is not allowed. Please wrap the code in an `action` if this change is intended. Tried to modify: "
                    : "Side effects like changing state are not allowed at this point. Are you trying to modify state from, for example, the render function of a React component? Tried to modify: ") +
                    atom.name);
    }
    function checkIfStateReadsAreAllowed(observable) {
        if (process.env.NODE_ENV !== "production" &&
            !globalState.allowStateReads &&
            globalState.observableRequiresReaction) {
            console.warn("[mobx] Observable " + observable.name + " being read outside a reactive context");
        }
    }
    /**
     * Executes the provided function `f` and tracks which observables are being accessed.
     * The tracking information is stored on the `derivation` object and the derivation is registered
     * as observer of any of the accessed observables.
     */
    function trackDerivedFunction(derivation, f, context) {
        var prevAllowStateReads = allowStateReadsStart(true);
        // pre allocate array allocation + room for variation in deps
        // array will be trimmed by bindDependencies
        changeDependenciesStateTo0(derivation);
        derivation.newObserving = new Array(derivation.observing.length + 100);
        derivation.unboundDepsCount = 0;
        derivation.runId = ++globalState.runId;
        var prevTracking = globalState.trackingDerivation;
        globalState.trackingDerivation = derivation;
        var result;
        if (globalState.disableErrorBoundaries === true) {
            result = f.call(context);
        }
        else {
            try {
                result = f.call(context);
            }
            catch (e) {
                result = new CaughtException(e);
            }
        }
        globalState.trackingDerivation = prevTracking;
        bindDependencies(derivation);
        warnAboutDerivationWithoutDependencies(derivation);
        allowStateReadsEnd(prevAllowStateReads);
        return result;
    }
    function warnAboutDerivationWithoutDependencies(derivation) {
        if (process.env.NODE_ENV === "production")
            return;
        if (derivation.observing.length !== 0)
            return;
        if (globalState.reactionRequiresObservable || derivation.requiresObservable) {
            console.warn("[mobx] Derivation " + derivation.name + " is created/updated without reading any observable value");
        }
    }
    /**
     * diffs newObserving with observing.
     * update observing to be newObserving with unique observables
     * notify observers that become observed/unobserved
     */
    function bindDependencies(derivation) {
        // invariant(derivation.dependenciesState !== IDerivationState.NOT_TRACKING, "INTERNAL ERROR bindDependencies expects derivation.dependenciesState !== -1");
        var prevObserving = derivation.observing;
        var observing = (derivation.observing = derivation.newObserving);
        var lowestNewObservingDerivationState = IDerivationState.UP_TO_DATE;
        // Go through all new observables and check diffValue: (this list can contain duplicates):
        //   0: first occurrence, change to 1 and keep it
        //   1: extra occurrence, drop it
        var i0 = 0, l = derivation.unboundDepsCount;
        for (var i = 0; i < l; i++) {
            var dep = observing[i];
            if (dep.diffValue === 0) {
                dep.diffValue = 1;
                if (i0 !== i)
                    observing[i0] = dep;
                i0++;
            }
            // Upcast is 'safe' here, because if dep is IObservable, `dependenciesState` will be undefined,
            // not hitting the condition
            if (dep.dependenciesState > lowestNewObservingDerivationState) {
                lowestNewObservingDerivationState = dep.dependenciesState;
            }
        }
        observing.length = i0;
        derivation.newObserving = null; // newObserving shouldn't be needed outside tracking (statement moved down to work around FF bug, see #614)
        // Go through all old observables and check diffValue: (it is unique after last bindDependencies)
        //   0: it's not in new observables, unobserve it
        //   1: it keeps being observed, don't want to notify it. change to 0
        l = prevObserving.length;
        while (l--) {
            var dep = prevObserving[l];
            if (dep.diffValue === 0) {
                removeObserver(dep, derivation);
            }
            dep.diffValue = 0;
        }
        // Go through all new observables and check diffValue: (now it should be unique)
        //   0: it was set to 0 in last loop. don't need to do anything.
        //   1: it wasn't observed, let's observe it. set back to 0
        while (i0--) {
            var dep = observing[i0];
            if (dep.diffValue === 1) {
                dep.diffValue = 0;
                addObserver(dep, derivation);
            }
        }
        // Some new observed derivations may become stale during this derivation computation
        // so they have had no chance to propagate staleness (#916)
        if (lowestNewObservingDerivationState !== IDerivationState.UP_TO_DATE) {
            derivation.dependenciesState = lowestNewObservingDerivationState;
            derivation.onBecomeStale();
        }
    }
    function clearObserving(derivation) {
        // invariant(globalState.inBatch > 0, "INTERNAL ERROR clearObserving should be called only inside batch");
        var obs = derivation.observing;
        derivation.observing = [];
        var i = obs.length;
        while (i--)
            removeObserver(obs[i], derivation);
        derivation.dependenciesState = IDerivationState.NOT_TRACKING;
    }
    function untracked(action) {
        var prev = untrackedStart();
        try {
            return action();
        }
        finally {
            untrackedEnd(prev);
        }
    }
    function untrackedStart() {
        var prev = globalState.trackingDerivation;
        globalState.trackingDerivation = null;
        return prev;
    }
    function untrackedEnd(prev) {
        globalState.trackingDerivation = prev;
    }
    function allowStateReadsStart(allowStateReads) {
        var prev = globalState.allowStateReads;
        globalState.allowStateReads = allowStateReads;
        return prev;
    }
    function allowStateReadsEnd(prev) {
        globalState.allowStateReads = prev;
    }
    /**
     * needed to keep `lowestObserverState` correct. when changing from (2 or 1) to 0
     *
     */
    function changeDependenciesStateTo0(derivation) {
        if (derivation.dependenciesState === IDerivationState.UP_TO_DATE)
            return;
        derivation.dependenciesState = IDerivationState.UP_TO_DATE;
        var obs = derivation.observing;
        var i = obs.length;
        while (i--)
            obs[i].lowestObserverState = IDerivationState.UP_TO_DATE;
    }

    // we don't use globalState for these in order to avoid possible issues with multiple
    // mobx versions
    var currentActionId = 0;
    var nextActionId = 1;
    var functionNameDescriptor = Object.getOwnPropertyDescriptor(function () { }, "name");
    var isFunctionNameConfigurable = functionNameDescriptor && functionNameDescriptor.configurable;
    function createAction(actionName, fn, ref) {
        if (process.env.NODE_ENV !== "production") {
            invariant(typeof fn === "function", "`action` can only be invoked on functions");
            if (typeof actionName !== "string" || !actionName)
                fail$1("actions should have valid names, got: '" + actionName + "'");
        }
        var res = function () {
            return executeAction(actionName, fn, ref || this, arguments);
        };
        res.isMobxAction = true;
        if (process.env.NODE_ENV !== "production") {
            if (isFunctionNameConfigurable) {
                Object.defineProperty(res, "name", { value: actionName });
            }
        }
        return res;
    }
    function executeAction(actionName, fn, scope, args) {
        var runInfo = _startAction(actionName, scope, args);
        try {
            return fn.apply(scope, args);
        }
        catch (err) {
            runInfo.error = err;
            throw err;
        }
        finally {
            _endAction(runInfo);
        }
    }
    function _startAction(actionName, scope, args) {
        var notifySpy = isSpyEnabled() && !!actionName;
        var startTime = 0;
        if (notifySpy && process.env.NODE_ENV !== "production") {
            startTime = Date.now();
            var l = (args && args.length) || 0;
            var flattendArgs = new Array(l);
            if (l > 0)
                for (var i = 0; i < l; i++)
                    flattendArgs[i] = args[i];
            spyReportStart({
                type: "action",
                name: actionName,
                object: scope,
                arguments: flattendArgs
            });
        }
        var prevDerivation = untrackedStart();
        startBatch();
        var prevAllowStateChanges = allowStateChangesStart(true);
        var prevAllowStateReads = allowStateReadsStart(true);
        var runInfo = {
            prevDerivation: prevDerivation,
            prevAllowStateChanges: prevAllowStateChanges,
            prevAllowStateReads: prevAllowStateReads,
            notifySpy: notifySpy,
            startTime: startTime,
            actionId: nextActionId++,
            parentActionId: currentActionId
        };
        currentActionId = runInfo.actionId;
        return runInfo;
    }
    function _endAction(runInfo) {
        if (currentActionId !== runInfo.actionId) {
            fail$1("invalid action stack. did you forget to finish an action?");
        }
        currentActionId = runInfo.parentActionId;
        if (runInfo.error !== undefined) {
            globalState.suppressReactionErrors = true;
        }
        allowStateChangesEnd(runInfo.prevAllowStateChanges);
        allowStateReadsEnd(runInfo.prevAllowStateReads);
        endBatch();
        untrackedEnd(runInfo.prevDerivation);
        if (runInfo.notifySpy && process.env.NODE_ENV !== "production") {
            spyReportEnd({ time: Date.now() - runInfo.startTime });
        }
        globalState.suppressReactionErrors = false;
    }
    function allowStateChangesStart(allowStateChanges) {
        var prev = globalState.allowStateChanges;
        globalState.allowStateChanges = allowStateChanges;
        return prev;
    }
    function allowStateChangesEnd(prev) {
        globalState.allowStateChanges = prev;
    }
    function allowStateChangesInsideComputed(func) {
        var prev = globalState.computationDepth;
        globalState.computationDepth = 0;
        var res;
        try {
            res = func();
        }
        finally {
            globalState.computationDepth = prev;
        }
        return res;
    }

    var ObservableValue = /** @class */ (function (_super) {
        __extends(ObservableValue, _super);
        function ObservableValue(value, enhancer, name, notifySpy, equals) {
            if (name === void 0) { name = "ObservableValue@" + getNextId(); }
            if (notifySpy === void 0) { notifySpy = true; }
            if (equals === void 0) { equals = comparer.default; }
            var _this = _super.call(this, name) || this;
            _this.enhancer = enhancer;
            _this.name = name;
            _this.equals = equals;
            _this.hasUnreportedChange = false;
            _this.value = enhancer(value, undefined, name);
            if (notifySpy && isSpyEnabled() && process.env.NODE_ENV !== "production") {
                // only notify spy if this is a stand-alone observable
                spyReport({ type: "create", name: _this.name, newValue: "" + _this.value });
            }
            return _this;
        }
        ObservableValue.prototype.dehanceValue = function (value) {
            if (this.dehancer !== undefined)
                return this.dehancer(value);
            return value;
        };
        ObservableValue.prototype.set = function (newValue) {
            var oldValue = this.value;
            newValue = this.prepareNewValue(newValue);
            if (newValue !== globalState.UNCHANGED) {
                var notifySpy = isSpyEnabled();
                if (notifySpy && process.env.NODE_ENV !== "production") {
                    spyReportStart({
                        type: "update",
                        name: this.name,
                        newValue: newValue,
                        oldValue: oldValue
                    });
                }
                this.setNewValue(newValue);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
            }
        };
        ObservableValue.prototype.prepareNewValue = function (newValue) {
            checkIfStateModificationsAreAllowed(this);
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    object: this,
                    type: "update",
                    newValue: newValue
                });
                if (!change)
                    return globalState.UNCHANGED;
                newValue = change.newValue;
            }
            // apply modifier
            newValue = this.enhancer(newValue, this.value, this.name);
            return this.equals(this.value, newValue) ? globalState.UNCHANGED : newValue;
        };
        ObservableValue.prototype.setNewValue = function (newValue) {
            var oldValue = this.value;
            this.value = newValue;
            this.reportChanged();
            if (hasListeners(this)) {
                notifyListeners(this, {
                    type: "update",
                    object: this,
                    newValue: newValue,
                    oldValue: oldValue
                });
            }
        };
        ObservableValue.prototype.get = function () {
            this.reportObserved();
            return this.dehanceValue(this.value);
        };
        ObservableValue.prototype.intercept = function (handler) {
            return registerInterceptor(this, handler);
        };
        ObservableValue.prototype.observe = function (listener, fireImmediately) {
            if (fireImmediately)
                listener({
                    object: this,
                    type: "update",
                    newValue: this.value,
                    oldValue: undefined
                });
            return registerListener(this, listener);
        };
        ObservableValue.prototype.toJSON = function () {
            return this.get();
        };
        ObservableValue.prototype.toString = function () {
            return this.name + "[" + this.value + "]";
        };
        ObservableValue.prototype.valueOf = function () {
            return toPrimitive(this.get());
        };
        ObservableValue.prototype[Symbol.toPrimitive] = function () {
            return this.valueOf();
        };
        return ObservableValue;
    }(Atom));
    var isObservableValue = createInstanceofPredicate("ObservableValue", ObservableValue);

    /**
     * A node in the state dependency root that observes other nodes, and can be observed itself.
     *
     * ComputedValue will remember the result of the computation for the duration of the batch, or
     * while being observed.
     *
     * During this time it will recompute only when one of its direct dependencies changed,
     * but only when it is being accessed with `ComputedValue.get()`.
     *
     * Implementation description:
     * 1. First time it's being accessed it will compute and remember result
     *    give back remembered result until 2. happens
     * 2. First time any deep dependency change, propagate POSSIBLY_STALE to all observers, wait for 3.
     * 3. When it's being accessed, recompute if any shallow dependency changed.
     *    if result changed: propagate STALE to all observers, that were POSSIBLY_STALE from the last step.
     *    go to step 2. either way
     *
     * If at any point it's outside batch and it isn't observed: reset everything and go to 1.
     */
    var ComputedValue = /** @class */ (function () {
        /**
         * Create a new computed value based on a function expression.
         *
         * The `name` property is for debug purposes only.
         *
         * The `equals` property specifies the comparer function to use to determine if a newly produced
         * value differs from the previous value. Two comparers are provided in the library; `defaultComparer`
         * compares based on identity comparison (===), and `structualComparer` deeply compares the structure.
         * Structural comparison can be convenient if you always produce a new aggregated object and
         * don't want to notify observers if it is structurally the same.
         * This is useful for working with vectors, mouse coordinates etc.
         */
        function ComputedValue(options) {
            this.dependenciesState = IDerivationState.NOT_TRACKING;
            this.observing = []; // nodes we are looking at. Our value depends on these nodes
            this.newObserving = null; // during tracking it's an array with new observed observers
            this.isBeingObserved = false;
            this.isPendingUnobservation = false;
            this.observers = new Set();
            this.diffValue = 0;
            this.runId = 0;
            this.lastAccessedBy = 0;
            this.lowestObserverState = IDerivationState.UP_TO_DATE;
            this.unboundDepsCount = 0;
            this.__mapid = "#" + getNextId();
            this.value = new CaughtException(null);
            this.isComputing = false; // to check for cycles
            this.isRunningSetter = false;
            this.isTracing = TraceMode.NONE;
            invariant(options.get, "missing option for computed: get");
            this.derivation = options.get;
            this.name = options.name || "ComputedValue@" + getNextId();
            if (options.set)
                this.setter = createAction(this.name + "-setter", options.set);
            this.equals =
                options.equals ||
                    (options.compareStructural || options.struct
                        ? comparer.structural
                        : comparer.default);
            this.scope = options.context;
            this.requiresReaction = !!options.requiresReaction;
            this.keepAlive = !!options.keepAlive;
        }
        ComputedValue.prototype.onBecomeStale = function () {
            propagateMaybeChanged(this);
        };
        ComputedValue.prototype.onBecomeObserved = function () {
            if (this.onBecomeObservedListeners) {
                this.onBecomeObservedListeners.forEach(function (listener) { return listener(); });
            }
        };
        ComputedValue.prototype.onBecomeUnobserved = function () {
            if (this.onBecomeUnobservedListeners) {
                this.onBecomeUnobservedListeners.forEach(function (listener) { return listener(); });
            }
        };
        /**
         * Returns the current value of this computed value.
         * Will evaluate its computation first if needed.
         */
        ComputedValue.prototype.get = function () {
            if (this.isComputing)
                fail$1("Cycle detected in computation " + this.name + ": " + this.derivation);
            if (globalState.inBatch === 0 && this.observers.size === 0 && !this.keepAlive) {
                if (shouldCompute(this)) {
                    this.warnAboutUntrackedRead();
                    startBatch(); // See perf test 'computed memoization'
                    this.value = this.computeValue(false);
                    endBatch();
                }
            }
            else {
                reportObserved(this);
                if (shouldCompute(this))
                    if (this.trackAndCompute())
                        propagateChangeConfirmed(this);
            }
            var result = this.value;
            if (isCaughtException(result))
                throw result.cause;
            return result;
        };
        ComputedValue.prototype.peek = function () {
            var res = this.computeValue(false);
            if (isCaughtException(res))
                throw res.cause;
            return res;
        };
        ComputedValue.prototype.set = function (value) {
            if (this.setter) {
                invariant(!this.isRunningSetter, "The setter of computed value '" + this.name + "' is trying to update itself. Did you intend to update an _observable_ value, instead of the computed property?");
                this.isRunningSetter = true;
                try {
                    this.setter.call(this.scope, value);
                }
                finally {
                    this.isRunningSetter = false;
                }
            }
            else
                invariant(false, process.env.NODE_ENV !== "production" &&
                    "[ComputedValue '" + this.name + "'] It is not possible to assign a new value to a computed value.");
        };
        ComputedValue.prototype.trackAndCompute = function () {
            if (isSpyEnabled() && process.env.NODE_ENV !== "production") {
                spyReport({
                    object: this.scope,
                    type: "compute",
                    name: this.name
                });
            }
            var oldValue = this.value;
            var wasSuspended = 
            /* see #1208 */ this.dependenciesState === IDerivationState.NOT_TRACKING;
            var newValue = this.computeValue(true);
            var changed = wasSuspended ||
                isCaughtException(oldValue) ||
                isCaughtException(newValue) ||
                !this.equals(oldValue, newValue);
            if (changed) {
                this.value = newValue;
            }
            return changed;
        };
        ComputedValue.prototype.computeValue = function (track) {
            this.isComputing = true;
            globalState.computationDepth++;
            var res;
            if (track) {
                res = trackDerivedFunction(this, this.derivation, this.scope);
            }
            else {
                if (globalState.disableErrorBoundaries === true) {
                    res = this.derivation.call(this.scope);
                }
                else {
                    try {
                        res = this.derivation.call(this.scope);
                    }
                    catch (e) {
                        res = new CaughtException(e);
                    }
                }
            }
            globalState.computationDepth--;
            this.isComputing = false;
            return res;
        };
        ComputedValue.prototype.suspend = function () {
            if (!this.keepAlive) {
                clearObserving(this);
                this.value = undefined; // don't hold on to computed value!
            }
        };
        ComputedValue.prototype.observe = function (listener, fireImmediately) {
            var _this = this;
            var firstTime = true;
            var prevValue = undefined;
            return autorun(function () {
                var newValue = _this.get();
                if (!firstTime || fireImmediately) {
                    var prevU = untrackedStart();
                    listener({
                        type: "update",
                        object: _this,
                        newValue: newValue,
                        oldValue: prevValue
                    });
                    untrackedEnd(prevU);
                }
                firstTime = false;
                prevValue = newValue;
            });
        };
        ComputedValue.prototype.warnAboutUntrackedRead = function () {
            if (process.env.NODE_ENV === "production")
                return;
            if (this.requiresReaction === true) {
                fail$1("[mobx] Computed value " + this.name + " is read outside a reactive context");
            }
            if (this.isTracing !== TraceMode.NONE) {
                console.log("[mobx.trace] '" + this.name + "' is being read outside a reactive context. Doing a full recompute");
            }
            if (globalState.computedRequiresReaction) {
                console.warn("[mobx] Computed value " + this.name + " is being read outside a reactive context. Doing a full recompute");
            }
        };
        ComputedValue.prototype.toJSON = function () {
            return this.get();
        };
        ComputedValue.prototype.toString = function () {
            return this.name + "[" + this.derivation.toString() + "]";
        };
        ComputedValue.prototype.valueOf = function () {
            return toPrimitive(this.get());
        };
        ComputedValue.prototype[Symbol.toPrimitive] = function () {
            return this.valueOf();
        };
        return ComputedValue;
    }());
    var isComputedValue = createInstanceofPredicate("ComputedValue", ComputedValue);
    var MobXGlobals = /** @class */ (function () {
        function MobXGlobals() {
            /**
             * MobXGlobals version.
             * MobX compatiblity with other versions loaded in memory as long as this version matches.
             * It indicates that the global state still stores similar information
             *
             * N.B: this version is unrelated to the package version of MobX, and is only the version of the
             * internal state storage of MobX, and can be the same across many different package versions
             */
            this.version = 5;
            /**
             * globally unique token to signal unchanged
             */
            this.UNCHANGED = {};
            /**
             * Currently running derivation
             */
            this.trackingDerivation = null;
            /**
             * Are we running a computation currently? (not a reaction)
             */
            this.computationDepth = 0;
            /**
             * Each time a derivation is tracked, it is assigned a unique run-id
             */
            this.runId = 0;
            /**
             * 'guid' for general purpose. Will be persisted amongst resets.
             */
            this.mobxGuid = 0;
            /**
             * Are we in a batch block? (and how many of them)
             */
            this.inBatch = 0;
            /**
             * Observables that don't have observers anymore, and are about to be
             * suspended, unless somebody else accesses it in the same batch
             *
             * @type {IObservable[]}
             */
            this.pendingUnobservations = [];
            /**
             * List of scheduled, not yet executed, reactions.
             */
            this.pendingReactions = [];
            /**
             * Are we currently processing reactions?
             */
            this.isRunningReactions = false;
            /**
             * Is it allowed to change observables at this point?
             * In general, MobX doesn't allow that when running computations and React.render.
             * To ensure that those functions stay pure.
             */
            this.allowStateChanges = true;
            /**
             * Is it allowed to read observables at this point?
             * Used to hold the state needed for `observableRequiresReaction`
             */
            this.allowStateReads = true;
            /**
             * If strict mode is enabled, state changes are by default not allowed
             */
            this.enforceActions = false;
            /**
             * Spy callbacks
             */
            this.spyListeners = [];
            /**
             * Globally attached error handlers that react specifically to errors in reactions
             */
            this.globalReactionErrorHandlers = [];
            /**
             * Warn if computed values are accessed outside a reactive context
             */
            this.computedRequiresReaction = false;
            /**
             * (Experimental)
             * Warn if you try to create to derivation / reactive context without accessing any observable.
             */
            this.reactionRequiresObservable = false;
            /**
             * (Experimental)
             * Warn if observables are accessed outside a reactive context
             */
            this.observableRequiresReaction = false;
            /**
             * Allows overwriting of computed properties, useful in tests but not prod as it can cause
             * memory leaks. See https://github.com/mobxjs/mobx/issues/1867
             */
            this.computedConfigurable = false;
            /*
             * Don't catch and rethrow exceptions. This is useful for inspecting the state of
             * the stack when an exception occurs while debugging.
             */
            this.disableErrorBoundaries = false;
            /*
             * If true, we are already handling an exception in an action. Any errors in reactions should be suppressed, as
             * they are not the cause, see: https://github.com/mobxjs/mobx/issues/1836
             */
            this.suppressReactionErrors = false;
        }
        return MobXGlobals;
    }());
    var mockGlobal = {};
    function getGlobal() {
        if (typeof window !== "undefined") {
            return window;
        }
        if (typeof global !== "undefined") {
            return global;
        }
        if (typeof self !== "undefined") {
            return self;
        }
        return mockGlobal;
    }
    var canMergeGlobalState = true;
    var globalState = (function () {
        var global = getGlobal();
        if (global.__mobxInstanceCount > 0 && !global.__mobxGlobals)
            canMergeGlobalState = false;
        if (global.__mobxGlobals && global.__mobxGlobals.version !== new MobXGlobals().version)
            canMergeGlobalState = false;
        if (!canMergeGlobalState) {
            setTimeout(function () {
                {
                    fail$1("There are multiple, different versions of MobX active. Make sure MobX is loaded only once or use `configure({ isolateGlobalState: true })`");
                }
            }, 1);
            return new MobXGlobals();
        }
        else if (global.__mobxGlobals) {
            global.__mobxInstanceCount += 1;
            if (!global.__mobxGlobals.UNCHANGED)
                global.__mobxGlobals.UNCHANGED = {}; // make merge backward compatible
            return global.__mobxGlobals;
        }
        else {
            global.__mobxInstanceCount = 1;
            return (global.__mobxGlobals = new MobXGlobals());
        }
    })();
    // function invariantObservers(observable: IObservable) {
    //     const list = observable.observers
    //     const map = observable.observersIndexes
    //     const l = list.length
    //     for (let i = 0; i < l; i++) {
    //         const id = list[i].__mapid
    //         if (i) {
    //             invariant(map[id] === i, "INTERNAL ERROR maps derivation.__mapid to index in list") // for performance
    //         } else {
    //             invariant(!(id in map), "INTERNAL ERROR observer on index 0 shouldn't be held in map.") // for performance
    //         }
    //     }
    //     invariant(
    //         list.length === 0 || Object.keys(map).length === list.length - 1,
    //         "INTERNAL ERROR there is no junk in map"
    //     )
    // }
    function addObserver(observable, node) {
        // invariant(node.dependenciesState !== -1, "INTERNAL ERROR, can add only dependenciesState !== -1");
        // invariant(observable._observers.indexOf(node) === -1, "INTERNAL ERROR add already added node");
        // invariantObservers(observable);
        observable.observers.add(node);
        if (observable.lowestObserverState > node.dependenciesState)
            observable.lowestObserverState = node.dependenciesState;
        // invariantObservers(observable);
        // invariant(observable._observers.indexOf(node) !== -1, "INTERNAL ERROR didn't add node");
    }
    function removeObserver(observable, node) {
        // invariant(globalState.inBatch > 0, "INTERNAL ERROR, remove should be called only inside batch");
        // invariant(observable._observers.indexOf(node) !== -1, "INTERNAL ERROR remove already removed node");
        // invariantObservers(observable);
        observable.observers.delete(node);
        if (observable.observers.size === 0) {
            // deleting last observer
            queueForUnobservation(observable);
        }
        // invariantObservers(observable);
        // invariant(observable._observers.indexOf(node) === -1, "INTERNAL ERROR remove already removed node2");
    }
    function queueForUnobservation(observable) {
        if (observable.isPendingUnobservation === false) {
            // invariant(observable._observers.length === 0, "INTERNAL ERROR, should only queue for unobservation unobserved observables");
            observable.isPendingUnobservation = true;
            globalState.pendingUnobservations.push(observable);
        }
    }
    /**
     * Batch starts a transaction, at least for purposes of memoizing ComputedValues when nothing else does.
     * During a batch `onBecomeUnobserved` will be called at most once per observable.
     * Avoids unnecessary recalculations.
     */
    function startBatch() {
        globalState.inBatch++;
    }
    function endBatch() {
        if (--globalState.inBatch === 0) {
            runReactions();
            // the batch is actually about to finish, all unobserving should happen here.
            var list = globalState.pendingUnobservations;
            for (var i = 0; i < list.length; i++) {
                var observable = list[i];
                observable.isPendingUnobservation = false;
                if (observable.observers.size === 0) {
                    if (observable.isBeingObserved) {
                        // if this observable had reactive observers, trigger the hooks
                        observable.isBeingObserved = false;
                        observable.onBecomeUnobserved();
                    }
                    if (observable instanceof ComputedValue) {
                        // computed values are automatically teared down when the last observer leaves
                        // this process happens recursively, this computed might be the last observabe of another, etc..
                        observable.suspend();
                    }
                }
            }
            globalState.pendingUnobservations = [];
        }
    }
    function reportObserved(observable) {
        checkIfStateReadsAreAllowed(observable);
        var derivation = globalState.trackingDerivation;
        if (derivation !== null) {
            /**
             * Simple optimization, give each derivation run an unique id (runId)
             * Check if last time this observable was accessed the same runId is used
             * if this is the case, the relation is already known
             */
            if (derivation.runId !== observable.lastAccessedBy) {
                observable.lastAccessedBy = derivation.runId;
                // Tried storing newObserving, or observing, or both as Set, but performance didn't come close...
                derivation.newObserving[derivation.unboundDepsCount++] = observable;
                if (!observable.isBeingObserved) {
                    observable.isBeingObserved = true;
                    observable.onBecomeObserved();
                }
            }
            return true;
        }
        else if (observable.observers.size === 0 && globalState.inBatch > 0) {
            queueForUnobservation(observable);
        }
        return false;
    }
    // function invariantLOS(observable: IObservable, msg: string) {
    //     // it's expensive so better not run it in produciton. but temporarily helpful for testing
    //     const min = getObservers(observable).reduce((a, b) => Math.min(a, b.dependenciesState), 2)
    //     if (min >= observable.lowestObserverState) return // <- the only assumption about `lowestObserverState`
    //     throw new Error(
    //         "lowestObserverState is wrong for " +
    //             msg +
    //             " because " +
    //             min +
    //             " < " +
    //             observable.lowestObserverState
    //     )
    // }
    /**
     * NOTE: current propagation mechanism will in case of self reruning autoruns behave unexpectedly
     * It will propagate changes to observers from previous run
     * It's hard or maybe impossible (with reasonable perf) to get it right with current approach
     * Hopefully self reruning autoruns aren't a feature people should depend on
     * Also most basic use cases should be ok
     */
    // Called by Atom when its value changes
    function propagateChanged(observable) {
        // invariantLOS(observable, "changed start");
        if (observable.lowestObserverState === IDerivationState.STALE)
            return;
        observable.lowestObserverState = IDerivationState.STALE;
        // Ideally we use for..of here, but the downcompiled version is really slow...
        observable.observers.forEach(function (d) {
            if (d.dependenciesState === IDerivationState.UP_TO_DATE) {
                if (d.isTracing !== TraceMode.NONE) {
                    logTraceInfo(d, observable);
                }
                d.onBecomeStale();
            }
            d.dependenciesState = IDerivationState.STALE;
        });
        // invariantLOS(observable, "changed end");
    }
    // Called by ComputedValue when it recalculate and its value changed
    function propagateChangeConfirmed(observable) {
        // invariantLOS(observable, "confirmed start");
        if (observable.lowestObserverState === IDerivationState.STALE)
            return;
        observable.lowestObserverState = IDerivationState.STALE;
        observable.observers.forEach(function (d) {
            if (d.dependenciesState === IDerivationState.POSSIBLY_STALE)
                d.dependenciesState = IDerivationState.STALE;
            else if (d.dependenciesState === IDerivationState.UP_TO_DATE // this happens during computing of `d`, just keep lowestObserverState up to date.
            )
                observable.lowestObserverState = IDerivationState.UP_TO_DATE;
        });
        // invariantLOS(observable, "confirmed end");
    }
    // Used by computed when its dependency changed, but we don't wan't to immediately recompute.
    function propagateMaybeChanged(observable) {
        // invariantLOS(observable, "maybe start");
        if (observable.lowestObserverState !== IDerivationState.UP_TO_DATE)
            return;
        observable.lowestObserverState = IDerivationState.POSSIBLY_STALE;
        observable.observers.forEach(function (d) {
            if (d.dependenciesState === IDerivationState.UP_TO_DATE) {
                d.dependenciesState = IDerivationState.POSSIBLY_STALE;
                if (d.isTracing !== TraceMode.NONE) {
                    logTraceInfo(d, observable);
                }
                d.onBecomeStale();
            }
        });
        // invariantLOS(observable, "maybe end");
    }
    function logTraceInfo(derivation, observable) {
        console.log("[mobx.trace] '" + derivation.name + "' is invalidated due to a change in: '" + observable.name + "'");
        if (derivation.isTracing === TraceMode.BREAK) {
            var lines = [];
            printDepTree(getDependencyTree(derivation), lines, 1);
            // prettier-ignore
            new Function("debugger;\n/*\nTracing '" + derivation.name + "'\n\nYou are entering this break point because derivation '" + derivation.name + "' is being traced and '" + observable.name + "' is now forcing it to update.\nJust follow the stacktrace you should now see in the devtools to see precisely what piece of your code is causing this update\nThe stackframe you are looking for is at least ~6-8 stack-frames up.\n\n" + (derivation instanceof ComputedValue ? derivation.derivation.toString().replace(/[*]\//g, "/") : "") + "\n\nThe dependencies for this derivation are:\n\n" + lines.join("\n") + "\n*/\n    ")();
        }
    }
    function printDepTree(tree, lines, depth) {
        if (lines.length >= 1000) {
            lines.push("(and many more)");
            return;
        }
        lines.push("" + new Array(depth).join("\t") + tree.name); // MWE: not the fastest, but the easiest way :)
        if (tree.dependencies)
            tree.dependencies.forEach(function (child) { return printDepTree(child, lines, depth + 1); });
    }

    var Reaction = /** @class */ (function () {
        function Reaction(name, onInvalidate, errorHandler, requiresObservable) {
            if (name === void 0) { name = "Reaction@" + getNextId(); }
            if (requiresObservable === void 0) { requiresObservable = false; }
            this.name = name;
            this.onInvalidate = onInvalidate;
            this.errorHandler = errorHandler;
            this.requiresObservable = requiresObservable;
            this.observing = []; // nodes we are looking at. Our value depends on these nodes
            this.newObserving = [];
            this.dependenciesState = IDerivationState.NOT_TRACKING;
            this.diffValue = 0;
            this.runId = 0;
            this.unboundDepsCount = 0;
            this.__mapid = "#" + getNextId();
            this.isDisposed = false;
            this._isScheduled = false;
            this._isTrackPending = false;
            this._isRunning = false;
            this.isTracing = TraceMode.NONE;
        }
        Reaction.prototype.onBecomeStale = function () {
            this.schedule();
        };
        Reaction.prototype.schedule = function () {
            if (!this._isScheduled) {
                this._isScheduled = true;
                globalState.pendingReactions.push(this);
                runReactions();
            }
        };
        Reaction.prototype.isScheduled = function () {
            return this._isScheduled;
        };
        /**
         * internal, use schedule() if you intend to kick off a reaction
         */
        Reaction.prototype.runReaction = function () {
            if (!this.isDisposed) {
                startBatch();
                this._isScheduled = false;
                if (shouldCompute(this)) {
                    this._isTrackPending = true;
                    try {
                        this.onInvalidate();
                        if (this._isTrackPending &&
                            isSpyEnabled() &&
                            process.env.NODE_ENV !== "production") {
                            // onInvalidate didn't trigger track right away..
                            spyReport({
                                name: this.name,
                                type: "scheduled-reaction"
                            });
                        }
                    }
                    catch (e) {
                        this.reportExceptionInDerivation(e);
                    }
                }
                endBatch();
            }
        };
        Reaction.prototype.track = function (fn) {
            if (this.isDisposed) {
                return;
                // console.warn("Reaction already disposed") // Note: Not a warning / error in mobx 4 either
            }
            startBatch();
            var notify = isSpyEnabled();
            var startTime;
            if (notify && process.env.NODE_ENV !== "production") {
                startTime = Date.now();
                spyReportStart({
                    name: this.name,
                    type: "reaction"
                });
            }
            this._isRunning = true;
            var result = trackDerivedFunction(this, fn, undefined);
            this._isRunning = false;
            this._isTrackPending = false;
            if (this.isDisposed) {
                // disposed during last run. Clean up everything that was bound after the dispose call.
                clearObserving(this);
            }
            if (isCaughtException(result))
                this.reportExceptionInDerivation(result.cause);
            if (notify && process.env.NODE_ENV !== "production") {
                spyReportEnd({
                    time: Date.now() - startTime
                });
            }
            endBatch();
        };
        Reaction.prototype.reportExceptionInDerivation = function (error) {
            var _this = this;
            if (this.errorHandler) {
                this.errorHandler(error, this);
                return;
            }
            if (globalState.disableErrorBoundaries)
                throw error;
            var message = "[mobx] Encountered an uncaught exception that was thrown by a reaction or observer component, in: '" + this + "'";
            if (globalState.suppressReactionErrors) {
                console.warn("[mobx] (error in reaction '" + this.name + "' suppressed, fix error of causing action below)"); // prettier-ignore
            }
            else {
                console.error(message, error);
                /** If debugging brought you here, please, read the above message :-). Tnx! */
            }
            if (isSpyEnabled()) {
                spyReport({
                    type: "error",
                    name: this.name,
                    message: message,
                    error: "" + error
                });
            }
            globalState.globalReactionErrorHandlers.forEach(function (f) { return f(error, _this); });
        };
        Reaction.prototype.dispose = function () {
            if (!this.isDisposed) {
                this.isDisposed = true;
                if (!this._isRunning) {
                    // if disposed while running, clean up later. Maybe not optimal, but rare case
                    startBatch();
                    clearObserving(this);
                    endBatch();
                }
            }
        };
        Reaction.prototype.getDisposer = function () {
            var r = this.dispose.bind(this);
            r[$mobx] = this;
            return r;
        };
        Reaction.prototype.toString = function () {
            return "Reaction[" + this.name + "]";
        };
        Reaction.prototype.trace = function (enterBreakPoint) {
            if (enterBreakPoint === void 0) { enterBreakPoint = false; }
            trace(this, enterBreakPoint);
        };
        return Reaction;
    }());
    /**
     * Magic number alert!
     * Defines within how many times a reaction is allowed to re-trigger itself
     * until it is assumed that this is gonna be a never ending loop...
     */
    var MAX_REACTION_ITERATIONS = 100;
    var reactionScheduler = function (f) { return f(); };
    function runReactions() {
        // Trampolining, if runReactions are already running, new reactions will be picked up
        if (globalState.inBatch > 0 || globalState.isRunningReactions)
            return;
        reactionScheduler(runReactionsHelper);
    }
    function runReactionsHelper() {
        globalState.isRunningReactions = true;
        var allReactions = globalState.pendingReactions;
        var iterations = 0;
        // While running reactions, new reactions might be triggered.
        // Hence we work with two variables and check whether
        // we converge to no remaining reactions after a while.
        while (allReactions.length > 0) {
            if (++iterations === MAX_REACTION_ITERATIONS) {
                console.error("Reaction doesn't converge to a stable state after " + MAX_REACTION_ITERATIONS + " iterations." +
                    (" Probably there is a cycle in the reactive function: " + allReactions[0]));
                allReactions.splice(0); // clear reactions
            }
            var remainingReactions = allReactions.splice(0);
            for (var i = 0, l = remainingReactions.length; i < l; i++)
                remainingReactions[i].runReaction();
        }
        globalState.isRunningReactions = false;
    }
    var isReaction = createInstanceofPredicate("Reaction", Reaction);

    function isSpyEnabled() {
        return process.env.NODE_ENV !== "production" && !!globalState.spyListeners.length;
    }
    function spyReport(event) {
        if (process.env.NODE_ENV === "production")
            return; // dead code elimination can do the rest
        if (!globalState.spyListeners.length)
            return;
        var listeners = globalState.spyListeners;
        for (var i = 0, l = listeners.length; i < l; i++)
            listeners[i](event);
    }
    function spyReportStart(event) {
        if (process.env.NODE_ENV === "production")
            return;
        var change = __assign(__assign({}, event), { spyReportStart: true });
        spyReport(change);
    }
    var END_EVENT = { spyReportEnd: true };
    function spyReportEnd(change) {
        if (process.env.NODE_ENV === "production")
            return;
        if (change)
            spyReport(__assign(__assign({}, change), { spyReportEnd: true }));
        else
            spyReport(END_EVENT);
    }
    function spy(listener) {
        if (process.env.NODE_ENV === "production") {
            console.warn("[mobx.spy] Is a no-op in production builds");
            return function () { };
        }
        else {
            globalState.spyListeners.push(listener);
            return once(function () {
                globalState.spyListeners = globalState.spyListeners.filter(function (l) { return l !== listener; });
            });
        }
    }

    function dontReassignFields() {
        fail$1(process.env.NODE_ENV !== "production" && "@action fields are not reassignable");
    }
    function namedActionDecorator(name) {
        return function (target, prop, descriptor) {
            if (descriptor) {
                if (process.env.NODE_ENV !== "production" && descriptor.get !== undefined) {
                    return fail$1("@action cannot be used with getters");
                }
                // babel / typescript
                // @action method() { }
                if (descriptor.value) {
                    // typescript
                    return {
                        value: createAction(name, descriptor.value),
                        enumerable: false,
                        configurable: true,
                        writable: true // for typescript, this must be writable, otherwise it cannot inherit :/ (see inheritable actions test)
                    };
                }
                // babel only: @action method = () => {}
                var initializer_1 = descriptor.initializer;
                return {
                    enumerable: false,
                    configurable: true,
                    writable: true,
                    initializer: function () {
                        // N.B: we can't immediately invoke initializer; this would be wrong
                        return createAction(name, initializer_1.call(this));
                    }
                };
            }
            // bound instance methods
            return actionFieldDecorator(name).apply(this, arguments);
        };
    }
    function actionFieldDecorator(name) {
        // Simple property that writes on first invocation to the current instance
        return function (target, prop, descriptor) {
            Object.defineProperty(target, prop, {
                configurable: true,
                enumerable: false,
                get: function () {
                    return undefined;
                },
                set: function (value) {
                    addHiddenProp(this, prop, action(name, value));
                }
            });
        };
    }
    function boundActionDecorator(target, propertyName, descriptor, applyToInstance) {
        if (applyToInstance === true) {
            defineBoundAction(target, propertyName, descriptor.value);
            return null;
        }
        if (descriptor) {
            // if (descriptor.value)
            // Typescript / Babel: @action.bound method() { }
            // also: babel @action.bound method = () => {}
            return {
                configurable: true,
                enumerable: false,
                get: function () {
                    defineBoundAction(this, propertyName, descriptor.value || descriptor.initializer.call(this));
                    return this[propertyName];
                },
                set: dontReassignFields
            };
        }
        // field decorator Typescript @action.bound method = () => {}
        return {
            enumerable: false,
            configurable: true,
            set: function (v) {
                defineBoundAction(this, propertyName, v);
            },
            get: function () {
                return undefined;
            }
        };
    }

    var action = function action(arg1, arg2, arg3, arg4) {
        // action(fn() {})
        if (arguments.length === 1 && typeof arg1 === "function")
            return createAction(arg1.name || "<unnamed action>", arg1);
        // action("name", fn() {})
        if (arguments.length === 2 && typeof arg2 === "function")
            return createAction(arg1, arg2);
        // @action("name") fn() {}
        if (arguments.length === 1 && typeof arg1 === "string")
            return namedActionDecorator(arg1);
        // @action fn() {}
        if (arg4 === true) {
            // apply to instance immediately
            addHiddenProp(arg1, arg2, createAction(arg1.name || arg2, arg3.value, this));
        }
        else {
            return namedActionDecorator(arg2).apply(null, arguments);
        }
    };
    action.bound = boundActionDecorator;
    function isAction(thing) {
        return typeof thing === "function" && thing.isMobxAction === true;
    }
    function defineBoundAction(target, propertyName, fn) {
        addHiddenProp(target, propertyName, createAction(propertyName, fn.bind(target)));
    }

    /**
     * Creates a named reactive view and keeps it alive, so that the view is always
     * updated if one of the dependencies changes, even when the view is not further used by something else.
     * @param view The reactive view
     * @returns disposer function, which can be used to stop the view from being updated in the future.
     */
    function autorun(view, opts) {
        if (opts === void 0) { opts = EMPTY_OBJECT; }
        if (process.env.NODE_ENV !== "production") {
            invariant(typeof view === "function", "Autorun expects a function as first argument");
            invariant(isAction(view) === false, "Autorun does not accept actions since actions are untrackable");
        }
        var name = (opts && opts.name) || view.name || "Autorun@" + getNextId();
        var runSync = !opts.scheduler && !opts.delay;
        var reaction;
        if (runSync) {
            // normal autorun
            reaction = new Reaction(name, function () {
                this.track(reactionRunner);
            }, opts.onError, opts.requiresObservable);
        }
        else {
            var scheduler_1 = createSchedulerFromOptions(opts);
            // debounced autorun
            var isScheduled_1 = false;
            reaction = new Reaction(name, function () {
                if (!isScheduled_1) {
                    isScheduled_1 = true;
                    scheduler_1(function () {
                        isScheduled_1 = false;
                        if (!reaction.isDisposed)
                            reaction.track(reactionRunner);
                    });
                }
            }, opts.onError, opts.requiresObservable);
        }
        function reactionRunner() {
            view(reaction);
        }
        reaction.schedule();
        return reaction.getDisposer();
    }
    var run = function (f) { return f(); };
    function createSchedulerFromOptions(opts) {
        return opts.scheduler
            ? opts.scheduler
            : opts.delay
                ? function (f) { return setTimeout(f, opts.delay); }
                : run;
    }
    function reaction(expression, effect, opts) {
        if (opts === void 0) { opts = EMPTY_OBJECT; }
        if (process.env.NODE_ENV !== "production") {
            invariant(typeof expression === "function", "First argument to reaction should be a function");
            invariant(typeof opts === "object", "Third argument of reactions should be an object");
        }
        var name = opts.name || "Reaction@" + getNextId();
        var effectAction = action(name, opts.onError ? wrapErrorHandler(opts.onError, effect) : effect);
        var runSync = !opts.scheduler && !opts.delay;
        var scheduler = createSchedulerFromOptions(opts);
        var firstTime = true;
        var isScheduled = false;
        var value;
        var equals = opts.compareStructural
            ? comparer.structural
            : opts.equals || comparer.default;
        var r = new Reaction(name, function () {
            if (firstTime || runSync) {
                reactionRunner();
            }
            else if (!isScheduled) {
                isScheduled = true;
                scheduler(reactionRunner);
            }
        }, opts.onError, opts.requiresObservable);
        function reactionRunner() {
            isScheduled = false; // Q: move into reaction runner?
            if (r.isDisposed)
                return;
            var changed = false;
            r.track(function () {
                var nextValue = expression(r);
                changed = firstTime || !equals(value, nextValue);
                value = nextValue;
            });
            if (firstTime && opts.fireImmediately)
                effectAction(value, r);
            if (!firstTime && changed === true)
                effectAction(value, r);
            if (firstTime)
                firstTime = false;
        }
        r.schedule();
        return r.getDisposer();
    }
    function wrapErrorHandler(errorHandler, baseFn) {
        return function () {
            try {
                return baseFn.apply(this, arguments);
            }
            catch (e) {
                errorHandler.call(this, e);
            }
        };
    }

    function onBecomeObserved(thing, arg2, arg3) {
        return interceptHook("onBecomeObserved", thing, arg2, arg3);
    }
    function onBecomeUnobserved(thing, arg2, arg3) {
        return interceptHook("onBecomeUnobserved", thing, arg2, arg3);
    }
    function interceptHook(hook, thing, arg2, arg3) {
        var atom = typeof arg3 === "function" ? getAtom(thing, arg2) : getAtom(thing);
        var cb = typeof arg3 === "function" ? arg3 : arg2;
        var listenersKey = hook + "Listeners";
        if (atom[listenersKey]) {
            atom[listenersKey].add(cb);
        }
        else {
            atom[listenersKey] = new Set([cb]);
        }
        var orig = atom[hook];
        if (typeof orig !== "function")
            return fail$1(process.env.NODE_ENV !== "production" && "Not an atom that can be (un)observed");
        return function () {
            var hookListeners = atom[listenersKey];
            if (hookListeners) {
                hookListeners.delete(cb);
                if (hookListeners.size === 0) {
                    delete atom[listenersKey];
                }
            }
        };
    }

    function extendObservable(target, properties, decorators, options) {
        if (process.env.NODE_ENV !== "production") {
            invariant(arguments.length >= 2 && arguments.length <= 4, "'extendObservable' expected 2-4 arguments");
            invariant(typeof target === "object", "'extendObservable' expects an object as first argument");
            invariant(!isObservableMap(target), "'extendObservable' should not be used on maps, use map.merge instead");
        }
        options = asCreateObservableOptions(options);
        var defaultDecorator = getDefaultDecoratorFromObjectOptions(options);
        initializeInstance(target); // Fixes #1740
        asObservableObject(target, options.name, defaultDecorator.enhancer); // make sure object is observable, even without initial props
        if (properties)
            extendObservableObjectWithProperties(target, properties, decorators, defaultDecorator);
        return target;
    }
    function getDefaultDecoratorFromObjectOptions(options) {
        return options.defaultDecorator || (options.deep === false ? refDecorator : deepDecorator);
    }
    function extendObservableObjectWithProperties(target, properties, decorators, defaultDecorator) {
        var e_1, _a, e_2, _b;
        if (process.env.NODE_ENV !== "production") {
            invariant(!isObservable(properties), "Extending an object with another observable (object) is not supported. Please construct an explicit propertymap, using `toJS` if need. See issue #540");
            if (decorators) {
                var keys = getPlainObjectKeys(decorators);
                try {
                    for (var keys_1 = __values(keys), keys_1_1 = keys_1.next(); !keys_1_1.done; keys_1_1 = keys_1.next()) {
                        var key = keys_1_1.value;
                        if (!(key in properties))
                            fail$1("Trying to declare a decorator for unspecified property '" + stringifyKey(key) + "'");
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (keys_1_1 && !keys_1_1.done && (_a = keys_1.return)) _a.call(keys_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
        }
        startBatch();
        try {
            var keys = getPlainObjectKeys(properties);
            try {
                for (var keys_2 = __values(keys), keys_2_1 = keys_2.next(); !keys_2_1.done; keys_2_1 = keys_2.next()) {
                    var key = keys_2_1.value;
                    var descriptor = Object.getOwnPropertyDescriptor(properties, key);
                    if (process.env.NODE_ENV !== "production") {
                        if (!isPlainObject(properties))
                            fail$1("'extendObservabe' only accepts plain objects as second argument");
                        if (isComputed(descriptor.value))
                            fail$1("Passing a 'computed' as initial property value is no longer supported by extendObservable. Use a getter or decorator instead");
                    }
                    var decorator = decorators && key in decorators
                        ? decorators[key]
                        : descriptor.get
                            ? computedDecorator
                            : defaultDecorator;
                    if (process.env.NODE_ENV !== "production" && typeof decorator !== "function")
                        fail$1("Not a valid decorator for '" + stringifyKey(key) + "', got: " + decorator);
                    var resultDescriptor = decorator(target, key, descriptor, true);
                    if (resultDescriptor // otherwise, assume already applied, due to `applyToInstance`
                    )
                        Object.defineProperty(target, key, resultDescriptor);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (keys_2_1 && !keys_2_1.done && (_b = keys_2.return)) _b.call(keys_2);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        finally {
            endBatch();
        }
    }

    function getDependencyTree(thing, property) {
        return nodeToDependencyTree(getAtom(thing, property));
    }
    function nodeToDependencyTree(node) {
        var result = {
            name: node.name
        };
        if (node.observing && node.observing.length > 0)
            result.dependencies = unique(node.observing).map(nodeToDependencyTree);
        return result;
    }

    function interceptReads(thing, propOrHandler, handler) {
        var target;
        if (isObservableMap(thing) || isObservableArray(thing) || isObservableValue(thing)) {
            target = getAdministration(thing);
        }
        else if (isObservableObject(thing)) {
            if (typeof propOrHandler !== "string")
                return fail$1(process.env.NODE_ENV !== "production" &&
                    "InterceptReads can only be used with a specific property, not with an object in general");
            target = getAdministration(thing, propOrHandler);
        }
        else {
            return fail$1(process.env.NODE_ENV !== "production" &&
                "Expected observable map, object or array as first array");
        }
        if (target.dehancer !== undefined)
            return fail$1(process.env.NODE_ENV !== "production" && "An intercept reader was already established");
        target.dehancer = typeof propOrHandler === "function" ? propOrHandler : handler;
        return function () {
            target.dehancer = undefined;
        };
    }

    function intercept(thing, propOrHandler, handler) {
        if (typeof handler === "function")
            return interceptProperty(thing, propOrHandler, handler);
        else
            return interceptInterceptable(thing, propOrHandler);
    }
    function interceptInterceptable(thing, handler) {
        return getAdministration(thing).intercept(handler);
    }
    function interceptProperty(thing, property, handler) {
        return getAdministration(thing, property).intercept(handler);
    }

    function _isComputed(value, property) {
        if (value === null || value === undefined)
            return false;
        if (property !== undefined) {
            if (isObservableObject(value) === false)
                return false;
            if (!value[$mobx].values.has(property))
                return false;
            var atom = getAtom(value, property);
            return isComputedValue(atom);
        }
        return isComputedValue(value);
    }
    function isComputed(value) {
        if (arguments.length > 1)
            return fail$1(process.env.NODE_ENV !== "production" &&
                "isComputed expects only 1 argument. Use isObservableProp to inspect the observability of a property");
        return _isComputed(value);
    }
    function isComputedProp(value, propName) {
        if (typeof propName !== "string")
            return fail$1(process.env.NODE_ENV !== "production" &&
                "isComputed expected a property name as second argument");
        return _isComputed(value, propName);
    }

    function _isObservable(value, property) {
        if (value === null || value === undefined)
            return false;
        if (property !== undefined) {
            if (process.env.NODE_ENV !== "production" &&
                (isObservableMap(value) || isObservableArray(value)))
                return fail$1("isObservable(object, propertyName) is not supported for arrays and maps. Use map.has or array.length instead.");
            if (isObservableObject(value)) {
                return value[$mobx].values.has(property);
            }
            return false;
        }
        // For first check, see #701
        return (isObservableObject(value) ||
            !!value[$mobx] ||
            isAtom(value) ||
            isReaction(value) ||
            isComputedValue(value));
    }
    function isObservable(value) {
        if (arguments.length !== 1)
            fail$1(process.env.NODE_ENV !== "production" &&
                "isObservable expects only 1 argument. Use isObservableProp to inspect the observability of a property");
        return _isObservable(value);
    }

    function keys(obj) {
        if (isObservableObject(obj)) {
            return obj[$mobx].getKeys();
        }
        if (isObservableMap(obj)) {
            return Array.from(obj.keys());
        }
        if (isObservableSet(obj)) {
            return Array.from(obj.keys());
        }
        if (isObservableArray(obj)) {
            return obj.map(function (_, index) { return index; });
        }
        return fail$1(process.env.NODE_ENV !== "production" &&
            "'keys()' can only be used on observable objects, arrays, sets and maps");
    }
    function values(obj) {
        if (isObservableObject(obj)) {
            return keys(obj).map(function (key) { return obj[key]; });
        }
        if (isObservableMap(obj)) {
            return keys(obj).map(function (key) { return obj.get(key); });
        }
        if (isObservableSet(obj)) {
            return Array.from(obj.values());
        }
        if (isObservableArray(obj)) {
            return obj.slice();
        }
        return fail$1(process.env.NODE_ENV !== "production" &&
            "'values()' can only be used on observable objects, arrays, sets and maps");
    }
    function entries(obj) {
        if (isObservableObject(obj)) {
            return keys(obj).map(function (key) { return [key, obj[key]]; });
        }
        if (isObservableMap(obj)) {
            return keys(obj).map(function (key) { return [key, obj.get(key)]; });
        }
        if (isObservableSet(obj)) {
            return Array.from(obj.entries());
        }
        if (isObservableArray(obj)) {
            return obj.map(function (key, index) { return [index, key]; });
        }
        return fail$1(process.env.NODE_ENV !== "production" &&
            "'entries()' can only be used on observable objects, arrays and maps");
    }
    function set(obj, key, value) {
        if (arguments.length === 2 && !isObservableSet(obj)) {
            startBatch();
            var values_1 = key;
            try {
                for (var key_1 in values_1)
                    set(obj, key_1, values_1[key_1]);
            }
            finally {
                endBatch();
            }
            return;
        }
        if (isObservableObject(obj)) {
            var adm = obj[$mobx];
            var existingObservable = adm.values.get(key);
            if (existingObservable) {
                adm.write(key, value);
            }
            else {
                adm.addObservableProp(key, value, adm.defaultEnhancer);
            }
        }
        else if (isObservableMap(obj)) {
            obj.set(key, value);
        }
        else if (isObservableSet(obj)) {
            obj.add(key);
        }
        else if (isObservableArray(obj)) {
            if (typeof key !== "number")
                key = parseInt(key, 10);
            invariant(key >= 0, "Not a valid index: '" + key + "'");
            startBatch();
            if (key >= obj.length)
                obj.length = key + 1;
            obj[key] = value;
            endBatch();
        }
        else {
            return fail$1(process.env.NODE_ENV !== "production" &&
                "'set()' can only be used on observable objects, arrays and maps");
        }
    }

    function observe(thing, propOrCb, cbOrFire, fireImmediately) {
        if (typeof cbOrFire === "function")
            return observeObservableProperty(thing, propOrCb, cbOrFire, fireImmediately);
        else
            return observeObservable(thing, propOrCb, cbOrFire);
    }
    function observeObservable(thing, listener, fireImmediately) {
        return getAdministration(thing).observe(listener, fireImmediately);
    }
    function observeObservableProperty(thing, property, listener, fireImmediately) {
        return getAdministration(thing, property).observe(listener, fireImmediately);
    }

    function trace() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var enterBreakPoint = false;
        if (typeof args[args.length - 1] === "boolean")
            enterBreakPoint = args.pop();
        var derivation = getAtomFromArgs(args);
        if (!derivation) {
            return fail$1(process.env.NODE_ENV !== "production" &&
                "'trace(break?)' can only be used inside a tracked computed value or a Reaction. Consider passing in the computed value or reaction explicitly");
        }
        if (derivation.isTracing === TraceMode.NONE) {
            console.log("[mobx.trace] '" + derivation.name + "' tracing enabled");
        }
        derivation.isTracing = enterBreakPoint ? TraceMode.BREAK : TraceMode.LOG;
    }
    function getAtomFromArgs(args) {
        switch (args.length) {
            case 0:
                return globalState.trackingDerivation;
            case 1:
                return getAtom(args[0]);
            case 2:
                return getAtom(args[0], args[1]);
        }
    }

    /**
     * During a transaction no views are updated until the end of the transaction.
     * The transaction will be run synchronously nonetheless.
     *
     * @param action a function that updates some reactive state
     * @returns any value that was returned by the 'action' parameter.
     */
    function transaction(action, thisArg) {
        if (thisArg === void 0) { thisArg = undefined; }
        startBatch();
        try {
            return action.apply(thisArg);
        }
        finally {
            endBatch();
        }
    }

    function getAdm(target) {
        return target[$mobx];
    }
    function isPropertyKey(val) {
        return typeof val === "string" || typeof val === "number" || typeof val === "symbol";
    }
    // Optimization: we don't need the intermediate objects and could have a completely custom administration for DynamicObjects,
    // and skip either the internal values map, or the base object with its property descriptors!
    var objectProxyTraps = {
        has: function (target, name) {
            if (name === $mobx || name === "constructor" || name === mobxDidRunLazyInitializersSymbol)
                return true;
            var adm = getAdm(target);
            // MWE: should `in` operator be reactive? If not, below code path will be faster / more memory efficient
            // TODO: check performance stats!
            // if (adm.values.get(name as string)) return true
            if (isPropertyKey(name))
                return adm.has(name);
            return name in target;
        },
        get: function (target, name) {
            if (name === $mobx || name === "constructor" || name === mobxDidRunLazyInitializersSymbol)
                return target[name];
            var adm = getAdm(target);
            var observable = adm.values.get(name);
            if (observable instanceof Atom) {
                var result = observable.get();
                if (result === undefined) {
                    // This fixes #1796, because deleting a prop that has an
                    // undefined value won't retrigger a observer (no visible effect),
                    // the autorun wouldn't subscribe to future key changes (see also next comment)
                    adm.has(name);
                }
                return result;
            }
            // make sure we start listening to future keys
            // note that we only do this here for optimization
            if (isPropertyKey(name))
                adm.has(name);
            return target[name];
        },
        set: function (target, name, value) {
            if (!isPropertyKey(name))
                return false;
            set(target, name, value);
            return true;
        },
        deleteProperty: function (target, name) {
            if (!isPropertyKey(name))
                return false;
            var adm = getAdm(target);
            adm.remove(name);
            return true;
        },
        ownKeys: function (target) {
            var adm = getAdm(target);
            adm.keysAtom.reportObserved();
            return Reflect.ownKeys(target);
        },
        preventExtensions: function (target) {
            fail$1("Dynamic observable objects cannot be frozen");
            return false;
        }
    };
    function createDynamicObservableObject(base) {
        var proxy = new Proxy(base, objectProxyTraps);
        base[$mobx].proxy = proxy;
        return proxy;
    }

    function hasInterceptors(interceptable) {
        return interceptable.interceptors !== undefined && interceptable.interceptors.length > 0;
    }
    function registerInterceptor(interceptable, handler) {
        var interceptors = interceptable.interceptors || (interceptable.interceptors = []);
        interceptors.push(handler);
        return once(function () {
            var idx = interceptors.indexOf(handler);
            if (idx !== -1)
                interceptors.splice(idx, 1);
        });
    }
    function interceptChange(interceptable, change) {
        var prevU = untrackedStart();
        try {
            // Interceptor can modify the array, copy it to avoid concurrent modification, see #1950
            var interceptors = __spread((interceptable.interceptors || []));
            for (var i = 0, l = interceptors.length; i < l; i++) {
                change = interceptors[i](change);
                invariant(!change || change.type, "Intercept handlers should return nothing or a change object");
                if (!change)
                    break;
            }
            return change;
        }
        finally {
            untrackedEnd(prevU);
        }
    }

    function hasListeners(listenable) {
        return listenable.changeListeners !== undefined && listenable.changeListeners.length > 0;
    }
    function registerListener(listenable, handler) {
        var listeners = listenable.changeListeners || (listenable.changeListeners = []);
        listeners.push(handler);
        return once(function () {
            var idx = listeners.indexOf(handler);
            if (idx !== -1)
                listeners.splice(idx, 1);
        });
    }
    function notifyListeners(listenable, change) {
        var prevU = untrackedStart();
        var listeners = listenable.changeListeners;
        if (!listeners)
            return;
        listeners = listeners.slice();
        for (var i = 0, l = listeners.length; i < l; i++) {
            listeners[i](change);
        }
        untrackedEnd(prevU);
    }

    var MAX_SPLICE_SIZE = 10000; // See e.g. https://github.com/mobxjs/mobx/issues/859
    var arrayTraps = {
        get: function (target, name) {
            if (name === $mobx)
                return target[$mobx];
            if (name === "length")
                return target[$mobx].getArrayLength();
            if (typeof name === "number") {
                return arrayExtensions.get.call(target, name);
            }
            if (typeof name === "string" && !isNaN(name)) {
                return arrayExtensions.get.call(target, parseInt(name));
            }
            if (arrayExtensions.hasOwnProperty(name)) {
                return arrayExtensions[name];
            }
            return target[name];
        },
        set: function (target, name, value) {
            if (name === "length") {
                target[$mobx].setArrayLength(value);
            }
            if (typeof name === "number") {
                arrayExtensions.set.call(target, name, value);
            }
            if (typeof name === "symbol" || isNaN(name)) {
                target[name] = value;
            }
            else {
                // numeric string
                arrayExtensions.set.call(target, parseInt(name), value);
            }
            return true;
        },
        preventExtensions: function (target) {
            fail$1("Observable arrays cannot be frozen");
            return false;
        }
    };
    function createObservableArray(initialValues, enhancer, name, owned) {
        if (name === void 0) { name = "ObservableArray@" + getNextId(); }
        if (owned === void 0) { owned = false; }
        var adm = new ObservableArrayAdministration(name, enhancer, owned);
        addHiddenFinalProp(adm.values, $mobx, adm);
        var proxy = new Proxy(adm.values, arrayTraps);
        adm.proxy = proxy;
        if (initialValues && initialValues.length) {
            var prev = allowStateChangesStart(true);
            adm.spliceWithArray(0, 0, initialValues);
            allowStateChangesEnd(prev);
        }
        return proxy;
    }
    var ObservableArrayAdministration = /** @class */ (function () {
        function ObservableArrayAdministration(name, enhancer, owned) {
            this.owned = owned;
            this.values = [];
            this.proxy = undefined;
            this.lastKnownLength = 0;
            this.atom = new Atom(name || "ObservableArray@" + getNextId());
            this.enhancer = function (newV, oldV) { return enhancer(newV, oldV, name + "[..]"); };
        }
        ObservableArrayAdministration.prototype.dehanceValue = function (value) {
            if (this.dehancer !== undefined)
                return this.dehancer(value);
            return value;
        };
        ObservableArrayAdministration.prototype.dehanceValues = function (values) {
            if (this.dehancer !== undefined && values.length > 0)
                return values.map(this.dehancer);
            return values;
        };
        ObservableArrayAdministration.prototype.intercept = function (handler) {
            return registerInterceptor(this, handler);
        };
        ObservableArrayAdministration.prototype.observe = function (listener, fireImmediately) {
            if (fireImmediately === void 0) { fireImmediately = false; }
            if (fireImmediately) {
                listener({
                    object: this.proxy,
                    type: "splice",
                    index: 0,
                    added: this.values.slice(),
                    addedCount: this.values.length,
                    removed: [],
                    removedCount: 0
                });
            }
            return registerListener(this, listener);
        };
        ObservableArrayAdministration.prototype.getArrayLength = function () {
            this.atom.reportObserved();
            return this.values.length;
        };
        ObservableArrayAdministration.prototype.setArrayLength = function (newLength) {
            if (typeof newLength !== "number" || newLength < 0)
                throw new Error("[mobx.array] Out of range: " + newLength);
            var currentLength = this.values.length;
            if (newLength === currentLength)
                return;
            else if (newLength > currentLength) {
                var newItems = new Array(newLength - currentLength);
                for (var i = 0; i < newLength - currentLength; i++)
                    newItems[i] = undefined; // No Array.fill everywhere...
                this.spliceWithArray(currentLength, 0, newItems);
            }
            else
                this.spliceWithArray(newLength, currentLength - newLength);
        };
        ObservableArrayAdministration.prototype.updateArrayLength = function (oldLength, delta) {
            if (oldLength !== this.lastKnownLength)
                throw new Error("[mobx] Modification exception: the internal structure of an observable array was changed.");
            this.lastKnownLength += delta;
        };
        ObservableArrayAdministration.prototype.spliceWithArray = function (index, deleteCount, newItems) {
            var _this = this;
            checkIfStateModificationsAreAllowed(this.atom);
            var length = this.values.length;
            if (index === undefined)
                index = 0;
            else if (index > length)
                index = length;
            else if (index < 0)
                index = Math.max(0, length + index);
            if (arguments.length === 1)
                deleteCount = length - index;
            else if (deleteCount === undefined || deleteCount === null)
                deleteCount = 0;
            else
                deleteCount = Math.max(0, Math.min(deleteCount, length - index));
            if (newItems === undefined)
                newItems = EMPTY_ARRAY;
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    object: this.proxy,
                    type: "splice",
                    index: index,
                    removedCount: deleteCount,
                    added: newItems
                });
                if (!change)
                    return EMPTY_ARRAY;
                deleteCount = change.removedCount;
                newItems = change.added;
            }
            newItems = newItems.length === 0 ? newItems : newItems.map(function (v) { return _this.enhancer(v, undefined); });
            if (process.env.NODE_ENV !== "production") {
                var lengthDelta = newItems.length - deleteCount;
                this.updateArrayLength(length, lengthDelta); // checks if internal array wasn't modified
            }
            var res = this.spliceItemsIntoValues(index, deleteCount, newItems);
            if (deleteCount !== 0 || newItems.length !== 0)
                this.notifyArraySplice(index, newItems, res);
            return this.dehanceValues(res);
        };
        ObservableArrayAdministration.prototype.spliceItemsIntoValues = function (index, deleteCount, newItems) {
            var _a;
            if (newItems.length < MAX_SPLICE_SIZE) {
                return (_a = this.values).splice.apply(_a, __spread([index, deleteCount], newItems));
            }
            else {
                var res = this.values.slice(index, index + deleteCount);
                this.values = this.values
                    .slice(0, index)
                    .concat(newItems, this.values.slice(index + deleteCount));
                return res;
            }
        };
        ObservableArrayAdministration.prototype.notifyArrayChildUpdate = function (index, newValue, oldValue) {
            var notifySpy = !this.owned && isSpyEnabled();
            var notify = hasListeners(this);
            var change = notify || notifySpy
                ? {
                    object: this.proxy,
                    type: "update",
                    index: index,
                    newValue: newValue,
                    oldValue: oldValue
                }
                : null;
            // The reason why this is on right hand side here (and not above), is this way the uglifier will drop it, but it won't
            // cause any runtime overhead in development mode without NODE_ENV set, unless spying is enabled
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportStart(__assign(__assign({}, change), { name: this.atom.name }));
            this.atom.reportChanged();
            if (notify)
                notifyListeners(this, change);
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportEnd();
        };
        ObservableArrayAdministration.prototype.notifyArraySplice = function (index, added, removed) {
            var notifySpy = !this.owned && isSpyEnabled();
            var notify = hasListeners(this);
            var change = notify || notifySpy
                ? {
                    object: this.proxy,
                    type: "splice",
                    index: index,
                    removed: removed,
                    added: added,
                    removedCount: removed.length,
                    addedCount: added.length
                }
                : null;
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportStart(__assign(__assign({}, change), { name: this.atom.name }));
            this.atom.reportChanged();
            // conform: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/observe
            if (notify)
                notifyListeners(this, change);
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportEnd();
        };
        return ObservableArrayAdministration;
    }());
    var arrayExtensions = {
        intercept: function (handler) {
            return this[$mobx].intercept(handler);
        },
        observe: function (listener, fireImmediately) {
            if (fireImmediately === void 0) { fireImmediately = false; }
            var adm = this[$mobx];
            return adm.observe(listener, fireImmediately);
        },
        clear: function () {
            return this.splice(0);
        },
        replace: function (newItems) {
            var adm = this[$mobx];
            return adm.spliceWithArray(0, adm.values.length, newItems);
        },
        /**
         * Converts this array back to a (shallow) javascript structure.
         * For a deep clone use mobx.toJS
         */
        toJS: function () {
            return this.slice();
        },
        toJSON: function () {
            // Used by JSON.stringify
            return this.toJS();
        },
        /*
         * functions that do alter the internal structure of the array, (based on lib.es6.d.ts)
         * since these functions alter the inner structure of the array, the have side effects.
         * Because the have side effects, they should not be used in computed function,
         * and for that reason the do not call dependencyState.notifyObserved
         */
        splice: function (index, deleteCount) {
            var newItems = [];
            for (var _i = 2; _i < arguments.length; _i++) {
                newItems[_i - 2] = arguments[_i];
            }
            var adm = this[$mobx];
            switch (arguments.length) {
                case 0:
                    return [];
                case 1:
                    return adm.spliceWithArray(index);
                case 2:
                    return adm.spliceWithArray(index, deleteCount);
            }
            return adm.spliceWithArray(index, deleteCount, newItems);
        },
        spliceWithArray: function (index, deleteCount, newItems) {
            var adm = this[$mobx];
            return adm.spliceWithArray(index, deleteCount, newItems);
        },
        push: function () {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            var adm = this[$mobx];
            adm.spliceWithArray(adm.values.length, 0, items);
            return adm.values.length;
        },
        pop: function () {
            return this.splice(Math.max(this[$mobx].values.length - 1, 0), 1)[0];
        },
        shift: function () {
            return this.splice(0, 1)[0];
        },
        unshift: function () {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            var adm = this[$mobx];
            adm.spliceWithArray(0, 0, items);
            return adm.values.length;
        },
        reverse: function () {
            // reverse by default mutates in place before returning the result
            // which makes it both a 'derivation' and a 'mutation'.
            // so we deviate from the default and just make it an dervitation
            if (process.env.NODE_ENV !== "production") {
                console.warn("[mobx] `observableArray.reverse()` will not update the array in place. Use `observableArray.slice().reverse()` to suppress this warning and perform the operation on a copy, or `observableArray.replace(observableArray.slice().reverse())` to reverse & update in place");
            }
            var clone = this.slice();
            return clone.reverse.apply(clone, arguments);
        },
        sort: function (compareFn) {
            // sort by default mutates in place before returning the result
            // which goes against all good practices. Let's not change the array in place!
            if (process.env.NODE_ENV !== "production") {
                console.warn("[mobx] `observableArray.sort()` will not update the array in place. Use `observableArray.slice().sort()` to suppress this warning and perform the operation on a copy, or `observableArray.replace(observableArray.slice().sort())` to sort & update in place");
            }
            var clone = this.slice();
            return clone.sort.apply(clone, arguments);
        },
        remove: function (value) {
            var adm = this[$mobx];
            var idx = adm.dehanceValues(adm.values).indexOf(value);
            if (idx > -1) {
                this.splice(idx, 1);
                return true;
            }
            return false;
        },
        get: function (index) {
            var adm = this[$mobx];
            if (adm) {
                if (index < adm.values.length) {
                    adm.atom.reportObserved();
                    return adm.dehanceValue(adm.values[index]);
                }
                console.warn("[mobx.array] Attempt to read an array index (" + index + ") that is out of bounds (" + adm.values.length + "). Please check length first. Out of bound indices will not be tracked by MobX");
            }
            return undefined;
        },
        set: function (index, newValue) {
            var adm = this[$mobx];
            var values = adm.values;
            if (index < values.length) {
                // update at index in range
                checkIfStateModificationsAreAllowed(adm.atom);
                var oldValue = values[index];
                if (hasInterceptors(adm)) {
                    var change = interceptChange(adm, {
                        type: "update",
                        object: adm.proxy,
                        index: index,
                        newValue: newValue
                    });
                    if (!change)
                        return;
                    newValue = change.newValue;
                }
                newValue = adm.enhancer(newValue, oldValue);
                var changed = newValue !== oldValue;
                if (changed) {
                    values[index] = newValue;
                    adm.notifyArrayChildUpdate(index, newValue, oldValue);
                }
            }
            else if (index === values.length) {
                // add a new item
                adm.spliceWithArray(index, 0, [newValue]);
            }
            else {
                // out of bounds
                throw new Error("[mobx.array] Index out of bounds, " + index + " is larger than " + values.length);
            }
        }
    };
    [
        "concat",
        "every",
        "filter",
        "forEach",
        "indexOf",
        "join",
        "lastIndexOf",
        "map",
        "reduce",
        "reduceRight",
        "slice",
        "some",
        "toString",
        "toLocaleString"
    ].forEach(function (funcName) {
        arrayExtensions[funcName] = function () {
            var adm = this[$mobx];
            adm.atom.reportObserved();
            var res = adm.dehanceValues(adm.values);
            return res[funcName].apply(res, arguments);
        };
    });
    var isObservableArrayAdministration = createInstanceofPredicate("ObservableArrayAdministration", ObservableArrayAdministration);
    function isObservableArray(thing) {
        return isObject(thing) && isObservableArrayAdministration(thing[$mobx]);
    }

    var _a;
    var ObservableMapMarker = {};
    // just extend Map? See also https://gist.github.com/nestharus/13b4d74f2ef4a2f4357dbd3fc23c1e54
    // But: https://github.com/mobxjs/mobx/issues/1556
    var ObservableMap = /** @class */ (function () {
        function ObservableMap(initialData, enhancer, name) {
            if (enhancer === void 0) { enhancer = deepEnhancer; }
            if (name === void 0) { name = "ObservableMap@" + getNextId(); }
            this.enhancer = enhancer;
            this.name = name;
            this[_a] = ObservableMapMarker;
            this._keysAtom = createAtom(this.name + ".keys()");
            this[Symbol.toStringTag] = "Map";
            if (typeof Map !== "function") {
                throw new Error("mobx.map requires Map polyfill for the current browser. Check babel-polyfill or core-js/es6/map.js");
            }
            this._data = new Map();
            this._hasMap = new Map();
            this.merge(initialData);
        }
        ObservableMap.prototype._has = function (key) {
            return this._data.has(key);
        };
        ObservableMap.prototype.has = function (key) {
            var _this = this;
            if (!globalState.trackingDerivation)
                return this._has(key);
            var entry = this._hasMap.get(key);
            if (!entry) {
                // todo: replace with atom (breaking change)
                var newEntry = (entry = new ObservableValue(this._has(key), referenceEnhancer, this.name + "." + stringifyKey(key) + "?", false));
                this._hasMap.set(key, newEntry);
                onBecomeUnobserved(newEntry, function () { return _this._hasMap.delete(key); });
            }
            return entry.get();
        };
        ObservableMap.prototype.set = function (key, value) {
            var hasKey = this._has(key);
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    type: hasKey ? "update" : "add",
                    object: this,
                    newValue: value,
                    name: key
                });
                if (!change)
                    return this;
                value = change.newValue;
            }
            if (hasKey) {
                this._updateValue(key, value);
            }
            else {
                this._addValue(key, value);
            }
            return this;
        };
        ObservableMap.prototype.delete = function (key) {
            var _this = this;
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    type: "delete",
                    object: this,
                    name: key
                });
                if (!change)
                    return false;
            }
            if (this._has(key)) {
                var notifySpy = isSpyEnabled();
                var notify = hasListeners(this);
                var change = notify || notifySpy
                    ? {
                        type: "delete",
                        object: this,
                        oldValue: this._data.get(key).value,
                        name: key
                    }
                    : null;
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportStart(__assign(__assign({}, change), { name: this.name, key: key }));
                transaction(function () {
                    _this._keysAtom.reportChanged();
                    _this._updateHasMapEntry(key, false);
                    var observable = _this._data.get(key);
                    observable.setNewValue(undefined);
                    _this._data.delete(key);
                });
                if (notify)
                    notifyListeners(this, change);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
                return true;
            }
            return false;
        };
        ObservableMap.prototype._updateHasMapEntry = function (key, value) {
            var entry = this._hasMap.get(key);
            if (entry) {
                entry.setNewValue(value);
            }
        };
        ObservableMap.prototype._updateValue = function (key, newValue) {
            var observable = this._data.get(key);
            newValue = observable.prepareNewValue(newValue);
            if (newValue !== globalState.UNCHANGED) {
                var notifySpy = isSpyEnabled();
                var notify = hasListeners(this);
                var change = notify || notifySpy
                    ? {
                        type: "update",
                        object: this,
                        oldValue: observable.value,
                        name: key,
                        newValue: newValue
                    }
                    : null;
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportStart(__assign(__assign({}, change), { name: this.name, key: key }));
                observable.setNewValue(newValue);
                if (notify)
                    notifyListeners(this, change);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
            }
        };
        ObservableMap.prototype._addValue = function (key, newValue) {
            var _this = this;
            checkIfStateModificationsAreAllowed(this._keysAtom);
            transaction(function () {
                var observable = new ObservableValue(newValue, _this.enhancer, _this.name + "." + stringifyKey(key), false);
                _this._data.set(key, observable);
                newValue = observable.value; // value might have been changed
                _this._updateHasMapEntry(key, true);
                _this._keysAtom.reportChanged();
            });
            var notifySpy = isSpyEnabled();
            var notify = hasListeners(this);
            var change = notify || notifySpy
                ? {
                    type: "add",
                    object: this,
                    name: key,
                    newValue: newValue
                }
                : null;
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportStart(__assign(__assign({}, change), { name: this.name, key: key }));
            if (notify)
                notifyListeners(this, change);
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportEnd();
        };
        ObservableMap.prototype.get = function (key) {
            if (this.has(key))
                return this.dehanceValue(this._data.get(key).get());
            return this.dehanceValue(undefined);
        };
        ObservableMap.prototype.dehanceValue = function (value) {
            if (this.dehancer !== undefined) {
                return this.dehancer(value);
            }
            return value;
        };
        ObservableMap.prototype.keys = function () {
            this._keysAtom.reportObserved();
            return this._data.keys();
        };
        ObservableMap.prototype.values = function () {
            var self = this;
            var nextIndex = 0;
            var keys = Array.from(this.keys());
            return makeIterable({
                next: function () {
                    return nextIndex < keys.length
                        ? { value: self.get(keys[nextIndex++]), done: false }
                        : { done: true };
                }
            });
        };
        ObservableMap.prototype.entries = function () {
            var self = this;
            var nextIndex = 0;
            var keys = Array.from(this.keys());
            return makeIterable({
                next: function () {
                    if (nextIndex < keys.length) {
                        var key = keys[nextIndex++];
                        return {
                            value: [key, self.get(key)],
                            done: false
                        };
                    }
                    return { done: true };
                }
            });
        };
        ObservableMap.prototype[(_a = $mobx, Symbol.iterator)] = function () {
            return this.entries();
        };
        ObservableMap.prototype.forEach = function (callback, thisArg) {
            var e_1, _b;
            try {
                for (var _c = __values(this), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var _e = __read(_d.value, 2), key = _e[0], value = _e[1];
                    callback.call(thisArg, value, key, this);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                }
                finally { if (e_1) throw e_1.error; }
            }
        };
        /** Merge another object into this object, returns this. */
        ObservableMap.prototype.merge = function (other) {
            var _this = this;
            if (isObservableMap(other)) {
                other = other.toJS();
            }
            transaction(function () {
                if (isPlainObject(other))
                    getPlainObjectKeys(other).forEach(function (key) { return _this.set(key, other[key]); });
                else if (Array.isArray(other))
                    other.forEach(function (_b) {
                        var _c = __read(_b, 2), key = _c[0], value = _c[1];
                        return _this.set(key, value);
                    });
                else if (isES6Map(other)) {
                    if (other.constructor !== Map)
                        fail$1("Cannot initialize from classes that inherit from Map: " + other.constructor.name); // prettier-ignore
                    other.forEach(function (value, key) { return _this.set(key, value); });
                }
                else if (other !== null && other !== undefined)
                    fail$1("Cannot initialize map from " + other);
            });
            return this;
        };
        ObservableMap.prototype.clear = function () {
            var _this = this;
            transaction(function () {
                untracked(function () {
                    var e_2, _b;
                    try {
                        for (var _c = __values(_this.keys()), _d = _c.next(); !_d.done; _d = _c.next()) {
                            var key = _d.value;
                            _this.delete(key);
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                });
            });
        };
        ObservableMap.prototype.replace = function (values) {
            var _this = this;
            transaction(function () {
                // grab all the keys that are present in the new map but not present in the current map
                // and delete them from the map, then merge the new map
                // this will cause reactions only on changed values
                var newKeys = getMapLikeKeys(values);
                var oldKeys = Array.from(_this.keys());
                var missingKeys = oldKeys.filter(function (k) { return newKeys.indexOf(k) === -1; });
                missingKeys.forEach(function (k) { return _this.delete(k); });
                _this.merge(values);
            });
            return this;
        };
        Object.defineProperty(ObservableMap.prototype, "size", {
            get: function () {
                this._keysAtom.reportObserved();
                return this._data.size;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Returns a plain object that represents this map.
         * Note that all the keys being stringified.
         * If there are duplicating keys after converting them to strings, behaviour is undetermined.
         */
        ObservableMap.prototype.toPOJO = function () {
            var e_3, _b;
            var res = {};
            try {
                for (var _c = __values(this), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var _e = __read(_d.value, 2), key = _e[0], value = _e[1];
                    // We lie about symbol key types due to https://github.com/Microsoft/TypeScript/issues/1863
                    res[typeof key === "symbol" ? key : stringifyKey(key)] = value;
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                }
                finally { if (e_3) throw e_3.error; }
            }
            return res;
        };
        /**
         * Returns a shallow non observable object clone of this map.
         * Note that the values migth still be observable. For a deep clone use mobx.toJS.
         */
        ObservableMap.prototype.toJS = function () {
            return new Map(this);
        };
        ObservableMap.prototype.toJSON = function () {
            // Used by JSON.stringify
            return this.toPOJO();
        };
        ObservableMap.prototype.toString = function () {
            var _this = this;
            return (this.name +
                "[{ " +
                Array.from(this.keys())
                    .map(function (key) { return stringifyKey(key) + ": " + ("" + _this.get(key)); })
                    .join(", ") +
                " }]");
        };
        /**
         * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
         * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
         * for callback details
         */
        ObservableMap.prototype.observe = function (listener, fireImmediately) {
            process.env.NODE_ENV !== "production" &&
                invariant(fireImmediately !== true, "`observe` doesn't support fireImmediately=true in combination with maps.");
            return registerListener(this, listener);
        };
        ObservableMap.prototype.intercept = function (handler) {
            return registerInterceptor(this, handler);
        };
        return ObservableMap;
    }());
    /* 'var' fixes small-build issue */
    var isObservableMap = createInstanceofPredicate("ObservableMap", ObservableMap);

    var _a$1;
    var ObservableSetMarker = {};
    var ObservableSet = /** @class */ (function () {
        function ObservableSet(initialData, enhancer, name) {
            if (enhancer === void 0) { enhancer = deepEnhancer; }
            if (name === void 0) { name = "ObservableSet@" + getNextId(); }
            this.name = name;
            this[_a$1] = ObservableSetMarker;
            this._data = new Set();
            this._atom = createAtom(this.name);
            this[Symbol.toStringTag] = "Set";
            if (typeof Set !== "function") {
                throw new Error("mobx.set requires Set polyfill for the current browser. Check babel-polyfill or core-js/es6/set.js");
            }
            this.enhancer = function (newV, oldV) { return enhancer(newV, oldV, name); };
            if (initialData) {
                this.replace(initialData);
            }
        }
        ObservableSet.prototype.dehanceValue = function (value) {
            if (this.dehancer !== undefined) {
                return this.dehancer(value);
            }
            return value;
        };
        ObservableSet.prototype.clear = function () {
            var _this = this;
            transaction(function () {
                untracked(function () {
                    var e_1, _b;
                    try {
                        for (var _c = __values(_this._data.values()), _d = _c.next(); !_d.done; _d = _c.next()) {
                            var value = _d.value;
                            _this.delete(value);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                });
            });
        };
        ObservableSet.prototype.forEach = function (callbackFn, thisArg) {
            var e_2, _b;
            try {
                for (var _c = __values(this), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var value = _d.value;
                    callbackFn.call(thisArg, value, value, this);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                }
                finally { if (e_2) throw e_2.error; }
            }
        };
        Object.defineProperty(ObservableSet.prototype, "size", {
            get: function () {
                this._atom.reportObserved();
                return this._data.size;
            },
            enumerable: true,
            configurable: true
        });
        ObservableSet.prototype.add = function (value) {
            var _this = this;
            checkIfStateModificationsAreAllowed(this._atom);
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    type: "add",
                    object: this,
                    newValue: value
                });
                if (!change)
                    return this;
                // TODO: ideally, value = change.value would be done here, so that values can be
                // changed by interceptor. Same applies for other Set and Map api's.
            }
            if (!this.has(value)) {
                transaction(function () {
                    _this._data.add(_this.enhancer(value, undefined));
                    _this._atom.reportChanged();
                });
                var notifySpy = isSpyEnabled();
                var notify = hasListeners(this);
                var change = notify || notifySpy
                    ? {
                        type: "add",
                        object: this,
                        newValue: value
                    }
                    : null;
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportStart(change);
                if (notify)
                    notifyListeners(this, change);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
            }
            return this;
        };
        ObservableSet.prototype.delete = function (value) {
            var _this = this;
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    type: "delete",
                    object: this,
                    oldValue: value
                });
                if (!change)
                    return false;
            }
            if (this.has(value)) {
                var notifySpy = isSpyEnabled();
                var notify = hasListeners(this);
                var change = notify || notifySpy
                    ? {
                        type: "delete",
                        object: this,
                        oldValue: value
                    }
                    : null;
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportStart(__assign(__assign({}, change), { name: this.name }));
                transaction(function () {
                    _this._atom.reportChanged();
                    _this._data.delete(value);
                });
                if (notify)
                    notifyListeners(this, change);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
                return true;
            }
            return false;
        };
        ObservableSet.prototype.has = function (value) {
            this._atom.reportObserved();
            return this._data.has(this.dehanceValue(value));
        };
        ObservableSet.prototype.entries = function () {
            var nextIndex = 0;
            var keys = Array.from(this.keys());
            var values = Array.from(this.values());
            return makeIterable({
                next: function () {
                    var index = nextIndex;
                    nextIndex += 1;
                    return index < values.length
                        ? { value: [keys[index], values[index]], done: false }
                        : { done: true };
                }
            });
        };
        ObservableSet.prototype.keys = function () {
            return this.values();
        };
        ObservableSet.prototype.values = function () {
            this._atom.reportObserved();
            var self = this;
            var nextIndex = 0;
            var observableValues = Array.from(this._data.values());
            return makeIterable({
                next: function () {
                    return nextIndex < observableValues.length
                        ? { value: self.dehanceValue(observableValues[nextIndex++]), done: false }
                        : { done: true };
                }
            });
        };
        ObservableSet.prototype.replace = function (other) {
            var _this = this;
            if (isObservableSet(other)) {
                other = other.toJS();
            }
            transaction(function () {
                if (Array.isArray(other)) {
                    _this.clear();
                    other.forEach(function (value) { return _this.add(value); });
                }
                else if (isES6Set(other)) {
                    _this.clear();
                    other.forEach(function (value) { return _this.add(value); });
                }
                else if (other !== null && other !== undefined) {
                    fail$1("Cannot initialize set from " + other);
                }
            });
            return this;
        };
        ObservableSet.prototype.observe = function (listener, fireImmediately) {
            // TODO 'fireImmediately' can be true?
            process.env.NODE_ENV !== "production" &&
                invariant(fireImmediately !== true, "`observe` doesn't support fireImmediately=true in combination with sets.");
            return registerListener(this, listener);
        };
        ObservableSet.prototype.intercept = function (handler) {
            return registerInterceptor(this, handler);
        };
        ObservableSet.prototype.toJS = function () {
            return new Set(this);
        };
        ObservableSet.prototype.toString = function () {
            return this.name + "[ " + Array.from(this).join(", ") + " ]";
        };
        ObservableSet.prototype[(_a$1 = $mobx, Symbol.iterator)] = function () {
            return this.values();
        };
        return ObservableSet;
    }());
    var isObservableSet = createInstanceofPredicate("ObservableSet", ObservableSet);

    var ObservableObjectAdministration = /** @class */ (function () {
        function ObservableObjectAdministration(target, values, name, defaultEnhancer) {
            if (values === void 0) { values = new Map(); }
            this.target = target;
            this.values = values;
            this.name = name;
            this.defaultEnhancer = defaultEnhancer;
            this.keysAtom = new Atom(name + ".keys");
        }
        ObservableObjectAdministration.prototype.read = function (key) {
            return this.values.get(key).get();
        };
        ObservableObjectAdministration.prototype.write = function (key, newValue) {
            var instance = this.target;
            var observable = this.values.get(key);
            if (observable instanceof ComputedValue) {
                observable.set(newValue);
                return;
            }
            // intercept
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    type: "update",
                    object: this.proxy || instance,
                    name: key,
                    newValue: newValue
                });
                if (!change)
                    return;
                newValue = change.newValue;
            }
            newValue = observable.prepareNewValue(newValue);
            // notify spy & observers
            if (newValue !== globalState.UNCHANGED) {
                var notify = hasListeners(this);
                var notifySpy = isSpyEnabled();
                var change = notify || notifySpy
                    ? {
                        type: "update",
                        object: this.proxy || instance,
                        oldValue: observable.value,
                        name: key,
                        newValue: newValue
                    }
                    : null;
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportStart(__assign(__assign({}, change), { name: this.name, key: key }));
                observable.setNewValue(newValue);
                if (notify)
                    notifyListeners(this, change);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
            }
        };
        ObservableObjectAdministration.prototype.has = function (key) {
            var map = this.pendingKeys || (this.pendingKeys = new Map());
            var entry = map.get(key);
            if (entry)
                return entry.get();
            else {
                var exists = !!this.values.get(key);
                // Possible optimization: Don't have a separate map for non existing keys,
                // but store them in the values map instead, using a special symbol to denote "not existing"
                entry = new ObservableValue(exists, referenceEnhancer, this.name + "." + stringifyKey(key) + "?", false);
                map.set(key, entry);
                return entry.get(); // read to subscribe
            }
        };
        ObservableObjectAdministration.prototype.addObservableProp = function (propName, newValue, enhancer) {
            if (enhancer === void 0) { enhancer = this.defaultEnhancer; }
            var target = this.target;
            assertPropertyConfigurable(target, propName);
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    object: this.proxy || target,
                    name: propName,
                    type: "add",
                    newValue: newValue
                });
                if (!change)
                    return;
                newValue = change.newValue;
            }
            var observable = new ObservableValue(newValue, enhancer, this.name + "." + stringifyKey(propName), false);
            this.values.set(propName, observable);
            newValue = observable.value; // observableValue might have changed it
            Object.defineProperty(target, propName, generateObservablePropConfig(propName));
            this.notifyPropertyAddition(propName, newValue);
        };
        ObservableObjectAdministration.prototype.addComputedProp = function (propertyOwner, // where is the property declared?
        propName, options) {
            var target = this.target;
            options.name = options.name || this.name + "." + stringifyKey(propName);
            this.values.set(propName, new ComputedValue(options));
            if (propertyOwner === target || isPropertyConfigurable(propertyOwner, propName))
                Object.defineProperty(propertyOwner, propName, generateComputedPropConfig(propName));
        };
        ObservableObjectAdministration.prototype.remove = function (key) {
            if (!this.values.has(key))
                return;
            var target = this.target;
            if (hasInterceptors(this)) {
                var change = interceptChange(this, {
                    object: this.proxy || target,
                    name: key,
                    type: "remove"
                });
                if (!change)
                    return;
            }
            try {
                startBatch();
                var notify = hasListeners(this);
                var notifySpy = isSpyEnabled();
                var oldObservable = this.values.get(key);
                var oldValue = oldObservable && oldObservable.get();
                oldObservable && oldObservable.set(undefined);
                // notify key and keyset listeners
                this.keysAtom.reportChanged();
                this.values.delete(key);
                if (this.pendingKeys) {
                    var entry = this.pendingKeys.get(key);
                    if (entry)
                        entry.set(false);
                }
                // delete the prop
                delete this.target[key];
                var change = notify || notifySpy
                    ? {
                        type: "remove",
                        object: this.proxy || target,
                        oldValue: oldValue,
                        name: key
                    }
                    : null;
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportStart(__assign(__assign({}, change), { name: this.name, key: key }));
                if (notify)
                    notifyListeners(this, change);
                if (notifySpy && process.env.NODE_ENV !== "production")
                    spyReportEnd();
            }
            finally {
                endBatch();
            }
        };
        ObservableObjectAdministration.prototype.illegalAccess = function (owner, propName) {
            /**
             * This happens if a property is accessed through the prototype chain, but the property was
             * declared directly as own property on the prototype.
             *
             * E.g.:
             * class A {
             * }
             * extendObservable(A.prototype, { x: 1 })
             *
             * classB extens A {
             * }
             * console.log(new B().x)
             *
             * It is unclear whether the property should be considered 'static' or inherited.
             * Either use `console.log(A.x)`
             * or: decorate(A, { x: observable })
             *
             * When using decorate, the property will always be redeclared as own property on the actual instance
             */
            console.warn("Property '" + propName + "' of '" + owner + "' was accessed through the prototype chain. Use 'decorate' instead to declare the prop or access it statically through it's owner");
        };
        /**
         * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
         * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
         * for callback details
         */
        ObservableObjectAdministration.prototype.observe = function (callback, fireImmediately) {
            process.env.NODE_ENV !== "production" &&
                invariant(fireImmediately !== true, "`observe` doesn't support the fire immediately property for observable objects.");
            return registerListener(this, callback);
        };
        ObservableObjectAdministration.prototype.intercept = function (handler) {
            return registerInterceptor(this, handler);
        };
        ObservableObjectAdministration.prototype.notifyPropertyAddition = function (key, newValue) {
            var notify = hasListeners(this);
            var notifySpy = isSpyEnabled();
            var change = notify || notifySpy
                ? {
                    type: "add",
                    object: this.proxy || this.target,
                    name: key,
                    newValue: newValue
                }
                : null;
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportStart(__assign(__assign({}, change), { name: this.name, key: key }));
            if (notify)
                notifyListeners(this, change);
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportEnd();
            if (this.pendingKeys) {
                var entry = this.pendingKeys.get(key);
                if (entry)
                    entry.set(true);
            }
            this.keysAtom.reportChanged();
        };
        ObservableObjectAdministration.prototype.getKeys = function () {
            var e_1, _a;
            this.keysAtom.reportObserved();
            // return Reflect.ownKeys(this.values) as any
            var res = [];
            try {
                for (var _b = __values(this.values), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = __read(_c.value, 2), key = _d[0], value = _d[1];
                    if (value instanceof ObservableValue)
                        res.push(key);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return res;
        };
        return ObservableObjectAdministration;
    }());
    function asObservableObject(target, name, defaultEnhancer) {
        if (name === void 0) { name = ""; }
        if (defaultEnhancer === void 0) { defaultEnhancer = deepEnhancer; }
        if (Object.prototype.hasOwnProperty.call(target, $mobx))
            return target[$mobx];
        process.env.NODE_ENV !== "production" &&
            invariant(Object.isExtensible(target), "Cannot make the designated object observable; it is not extensible");
        if (!isPlainObject(target))
            name = (target.constructor.name || "ObservableObject") + "@" + getNextId();
        if (!name)
            name = "ObservableObject@" + getNextId();
        var adm = new ObservableObjectAdministration(target, new Map(), stringifyKey(name), defaultEnhancer);
        addHiddenProp(target, $mobx, adm);
        return adm;
    }
    var observablePropertyConfigs = Object.create(null);
    var computedPropertyConfigs = Object.create(null);
    function generateObservablePropConfig(propName) {
        return (observablePropertyConfigs[propName] ||
            (observablePropertyConfigs[propName] = {
                configurable: true,
                enumerable: true,
                get: function () {
                    return this[$mobx].read(propName);
                },
                set: function (v) {
                    this[$mobx].write(propName, v);
                }
            }));
    }
    function getAdministrationForComputedPropOwner(owner) {
        var adm = owner[$mobx];
        if (!adm) {
            // because computed props are declared on proty,
            // the current instance might not have been initialized yet
            initializeInstance(owner);
            return owner[$mobx];
        }
        return adm;
    }
    function generateComputedPropConfig(propName) {
        return (computedPropertyConfigs[propName] ||
            (computedPropertyConfigs[propName] = {
                configurable: globalState.computedConfigurable,
                enumerable: false,
                get: function () {
                    return getAdministrationForComputedPropOwner(this).read(propName);
                },
                set: function (v) {
                    getAdministrationForComputedPropOwner(this).write(propName, v);
                }
            }));
    }
    var isObservableObjectAdministration = createInstanceofPredicate("ObservableObjectAdministration", ObservableObjectAdministration);
    function isObservableObject(thing) {
        if (isObject(thing)) {
            // Initializers run lazily when transpiling to babel, so make sure they are run...
            initializeInstance(thing);
            return isObservableObjectAdministration(thing[$mobx]);
        }
        return false;
    }

    function getAtom(thing, property) {
        if (typeof thing === "object" && thing !== null) {
            if (isObservableArray(thing)) {
                if (property !== undefined)
                    fail$1(process.env.NODE_ENV !== "production" &&
                        "It is not possible to get index atoms from arrays");
                return thing[$mobx].atom;
            }
            if (isObservableSet(thing)) {
                return thing[$mobx];
            }
            if (isObservableMap(thing)) {
                var anyThing = thing;
                if (property === undefined)
                    return anyThing._keysAtom;
                var observable = anyThing._data.get(property) || anyThing._hasMap.get(property);
                if (!observable)
                    fail$1(process.env.NODE_ENV !== "production" &&
                        "the entry '" + property + "' does not exist in the observable map '" + getDebugName(thing) + "'");
                return observable;
            }
            // Initializers run lazily when transpiling to babel, so make sure they are run...
            initializeInstance(thing);
            if (property && !thing[$mobx])
                thing[property]; // See #1072
            if (isObservableObject(thing)) {
                if (!property)
                    return fail$1(process.env.NODE_ENV !== "production" && "please specify a property");
                var observable = thing[$mobx].values.get(property);
                if (!observable)
                    fail$1(process.env.NODE_ENV !== "production" &&
                        "no observable property '" + property + "' found on the observable object '" + getDebugName(thing) + "'");
                return observable;
            }
            if (isAtom(thing) || isComputedValue(thing) || isReaction(thing)) {
                return thing;
            }
        }
        else if (typeof thing === "function") {
            if (isReaction(thing[$mobx])) {
                // disposer function
                return thing[$mobx];
            }
        }
        return fail$1(process.env.NODE_ENV !== "production" && "Cannot obtain atom from " + thing);
    }
    function getAdministration(thing, property) {
        if (!thing)
            fail$1("Expecting some object");
        if (property !== undefined)
            return getAdministration(getAtom(thing, property));
        if (isAtom(thing) || isComputedValue(thing) || isReaction(thing))
            return thing;
        if (isObservableMap(thing) || isObservableSet(thing))
            return thing;
        // Initializers run lazily when transpiling to babel, so make sure they are run...
        initializeInstance(thing);
        if (thing[$mobx])
            return thing[$mobx];
        fail$1(process.env.NODE_ENV !== "production" && "Cannot obtain administration from " + thing);
    }
    function getDebugName(thing, property) {
        var named;
        if (property !== undefined)
            named = getAtom(thing, property);
        else if (isObservableObject(thing) || isObservableMap(thing) || isObservableSet(thing))
            named = getAdministration(thing);
        else
            named = getAtom(thing); // valid for arrays as well
        return named.name;
    }

    var toString = Object.prototype.toString;
    function deepEqual(a, b, depth) {
        if (depth === void 0) { depth = -1; }
        return eq(a, b, depth);
    }
    // Copied from https://github.com/jashkenas/underscore/blob/5c237a7c682fb68fd5378203f0bf22dce1624854/underscore.js#L1186-L1289
    // Internal recursive comparison function for `isEqual`.
    function eq(a, b, depth, aStack, bStack) {
        // Identical objects are equal. `0 === -0`, but they aren't identical.
        // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
        if (a === b)
            return a !== 0 || 1 / a === 1 / b;
        // `null` or `undefined` only equal to itself (strict comparison).
        if (a == null || b == null)
            return false;
        // `NaN`s are equivalent, but non-reflexive.
        if (a !== a)
            return b !== b;
        // Exhaust primitive checks
        var type = typeof a;
        if (type !== "function" && type !== "object" && typeof b != "object")
            return false;
        // Compare `[[Class]]` names.
        var className = toString.call(a);
        if (className !== toString.call(b))
            return false;
        switch (className) {
            // Strings, numbers, regular expressions, dates, and booleans are compared by value.
            case "[object RegExp]":
            // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
            case "[object String]":
                // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
                // equivalent to `new String("5")`.
                return "" + a === "" + b;
            case "[object Number]":
                // `NaN`s are equivalent, but non-reflexive.
                // Object(NaN) is equivalent to NaN.
                if (+a !== +a)
                    return +b !== +b;
                // An `egal` comparison is performed for other numeric values.
                return +a === 0 ? 1 / +a === 1 / b : +a === +b;
            case "[object Date]":
            case "[object Boolean]":
                // Coerce dates and booleans to numeric primitive values. Dates are compared by their
                // millisecond representations. Note that invalid dates with millisecond representations
                // of `NaN` are not equivalent.
                return +a === +b;
            case "[object Symbol]":
                return (typeof Symbol !== "undefined" && Symbol.valueOf.call(a) === Symbol.valueOf.call(b));
            case "[object Map]":
            case "[object Set]":
                // Maps and Sets are unwrapped to arrays of entry-pairs, adding an incidental level.
                // Hide this extra level by increasing the depth.
                if (depth >= 0) {
                    depth++;
                }
                break;
        }
        // Unwrap any wrapped objects.
        a = unwrap(a);
        b = unwrap(b);
        var areArrays = className === "[object Array]";
        if (!areArrays) {
            if (typeof a != "object" || typeof b != "object")
                return false;
            // Objects with different constructors are not equivalent, but `Object`s or `Array`s
            // from different frames are.
            var aCtor = a.constructor, bCtor = b.constructor;
            if (aCtor !== bCtor &&
                !(typeof aCtor === "function" &&
                    aCtor instanceof aCtor &&
                    typeof bCtor === "function" &&
                    bCtor instanceof bCtor) &&
                ("constructor" in a && "constructor" in b)) {
                return false;
            }
        }
        if (depth === 0) {
            return false;
        }
        else if (depth < 0) {
            depth = -1;
        }
        // Assume equality for cyclic structures. The algorithm for detecting cyclic
        // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
        // Initializing stack of traversed objects.
        // It's done here since we only need them for objects and arrays comparison.
        aStack = aStack || [];
        bStack = bStack || [];
        var length = aStack.length;
        while (length--) {
            // Linear search. Performance is inversely proportional to the number of
            // unique nested structures.
            if (aStack[length] === a)
                return bStack[length] === b;
        }
        // Add the first object to the stack of traversed objects.
        aStack.push(a);
        bStack.push(b);
        // Recursively compare objects and arrays.
        if (areArrays) {
            // Compare array lengths to determine if a deep comparison is necessary.
            length = a.length;
            if (length !== b.length)
                return false;
            // Deep compare the contents, ignoring non-numeric properties.
            while (length--) {
                if (!eq(a[length], b[length], depth - 1, aStack, bStack))
                    return false;
            }
        }
        else {
            // Deep compare objects.
            var keys = Object.keys(a);
            var key = void 0;
            length = keys.length;
            // Ensure that both objects contain the same number of properties before comparing deep equality.
            if (Object.keys(b).length !== length)
                return false;
            while (length--) {
                // Deep compare each member
                key = keys[length];
                if (!(has$1(b, key) && eq(a[key], b[key], depth - 1, aStack, bStack)))
                    return false;
            }
        }
        // Remove the first object from the stack of traversed objects.
        aStack.pop();
        bStack.pop();
        return true;
    }
    function unwrap(a) {
        if (isObservableArray(a))
            return a.slice();
        if (isES6Map(a) || isObservableMap(a))
            return Array.from(a.entries());
        if (isES6Set(a) || isObservableSet(a))
            return Array.from(a.entries());
        return a;
    }
    function has$1(a, key) {
        return Object.prototype.hasOwnProperty.call(a, key);
    }

    function makeIterable(iterator) {
        iterator[Symbol.iterator] = getSelf;
        return iterator;
    }
    function getSelf() {
        return this;
    }

    /*
    The only reason for this file to exist is pure horror:
    Without it rollup can make the bundling fail at any point in time; when it rolls up the files in the wrong order
    it will cause undefined errors (for example because super classes or local variables not being hoisted).
    With this file that will still happen,
    but at least in this file we can magically reorder the imports with trial and error until the build succeeds again.
    */

    /**
     * (c) Michel Weststrate 2015 - 2018
     * MIT Licensed
     *
     * Welcome to the mobx sources! To get an global overview of how MobX internally works,
     * this is a good place to start:
     * https://medium.com/@mweststrate/becoming-fully-reactive-an-in-depth-explanation-of-mobservable-55995262a254#.xvbh6qd74
     *
     * Source folders:
     * ===============
     *
     * - api/     Most of the public static methods exposed by the module can be found here.
     * - core/    Implementation of the MobX algorithm; atoms, derivations, reactions, dependency trees, optimizations. Cool stuff can be found here.
     * - types/   All the magic that is need to have observable objects, arrays and values is in this folder. Including the modifiers like `asFlat`.
     * - utils/   Utility stuff.
     *
     */
    if (typeof Proxy === "undefined" || typeof Symbol === "undefined") {
        throw new Error("[mobx] MobX 5+ requires Proxy and Symbol objects. If your environment doesn't support Symbol or Proxy objects, please downgrade to MobX 4. For React Native Android, consider upgrading JSCore.");
    }
    try {
        // define process.env if needed
        // if this is not a production build in the first place
        // (in which case the expression below would be substituted with 'production')
        process.env.NODE_ENV;
    }
    catch (e) {
        var g = getGlobal();
        if (typeof process === "undefined")
            g.process = {};
        g.process.env = {};
    }
    (function () {
        function testCodeMinification() { }
        if (testCodeMinification.name !== "testCodeMinification" &&
            process.env.NODE_ENV !== "production" &&
            typeof process !== 'undefined' && process.env.IGNORE_MOBX_MINIFY_WARNING !== "true") {
            // trick so it doesn't get replaced
            var varName = ["process", "env", "NODE_ENV"].join(".");
            console.warn("[mobx] you are running a minified build, but '" + varName + "' was not set to 'production' in your bundler. This results in an unnecessarily large and slow bundle");
        }
    })();
    if (typeof __MOBX_DEVTOOLS_GLOBAL_HOOK__ === "object") {
        // See: https://github.com/andykog/mobx-devtools/
        __MOBX_DEVTOOLS_GLOBAL_HOOK__.injectMobx({
            spy: spy,
            extras: {
                getDebugName: getDebugName
            },
            $mobx: $mobx
        });
    }

    var livelinessChecking = "warn";
    /**
     * Returns the current liveliness checking mode.
     *
     * @returns `"warn"`, `"error"` or `"ignore"`
     */
    function getLivelinessChecking() {
        return livelinessChecking;
    }

    /**
     * @hidden
     */
    var Hook;
    (function (Hook) {
        Hook["afterCreate"] = "afterCreate";
        Hook["afterAttach"] = "afterAttach";
        Hook["afterCreationFinalization"] = "afterCreationFinalization";
        Hook["beforeDetach"] = "beforeDetach";
        Hook["beforeDestroy"] = "beforeDestroy";
    })(Hook || (Hook = {}));

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics$1 = function(d, b) {
        extendStatics$1 = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics$1(d, b);
    };

    function __extends$1(d, b) {
        extendStatics$1(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign$1 = function() {
        __assign$1 = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign$1.apply(this, arguments);
    };

    function __rest(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    }

    function __decorate(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __values$1(o) {
        var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
        if (m) return m.call(o);
        return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
    }

    function __read$1(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread$1() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read$1(arguments[i]));
        return ar;
    }

    /**
     * Returns the _actual_ type of the given tree node. (Or throws)
     *
     * @param object
     * @returns
     */
    function getType(object) {
        assertIsStateTreeNode(object, 1);
        return getStateTreeNode(object).type;
    }
    /**
     * Applies a JSON-patch to the given model instance or bails out if the patch couldn't be applied
     * See [patches](https://github.com/mobxjs/mobx-state-tree#patches) for more details.
     *
     * Can apply a single past, or an array of patches.
     *
     * @param target
     * @param patch
     * @returns
     */
    function applyPatch(target, patch) {
        // check all arguments
        assertIsStateTreeNode(target, 1);
        assertArg(patch, function (p) { return typeof p === "object"; }, "object or array", 2);
        getStateTreeNode(target).applyPatches(asArray(patch));
    }
    /**
     * Calculates a snapshot from the given model instance. The snapshot will always reflect the latest state but use
     * structural sharing where possible. Doesn't require MobX transactions to be completed.
     *
     * @param target
     * @param applyPostProcess If true (the default) then postProcessSnapshot gets applied.
     * @returns
     */
    function getSnapshot(target, applyPostProcess) {
        if (applyPostProcess === void 0) { applyPostProcess = true; }
        // check all arguments
        assertIsStateTreeNode(target, 1);
        var node = getStateTreeNode(target);
        if (applyPostProcess)
            return node.snapshot;
        return freeze(node.type.getSnapshot(node, false));
    }
    /**
     * Given an object in a model tree, returns the root object of that tree.
     *
     * Please note that in child nodes access to the root is only possible
     * once the `afterAttach` hook has fired.
     *
     * @param target
     * @returns
     */
    function getRoot(target) {
        // check all arguments
        assertIsStateTreeNode(target, 1);
        return getStateTreeNode(target).root.storedValue;
    }
    /**
     * Returns the path of the given object in the model tree
     *
     * @param target
     * @returns
     */
    function getPath(target) {
        // check all arguments
        assertIsStateTreeNode(target, 1);
        return getStateTreeNode(target).path;
    }
    /**
     * Returns the identifier of the target node.
     * This is the *string normalized* identifier, which might not match the type of the identifier attribute
     *
     * @param target
     * @returns
     */
    function getIdentifier(target) {
        // check all arguments
        assertIsStateTreeNode(target, 1);
        return getStateTreeNode(target).identifier;
    }
    /**
     * Casts a node snapshot or instance type to an instance type so it can be assigned to a type instance.
     * Note that this is just a cast for the type system, this is, it won't actually convert a snapshot to an instance,
     * but just fool typescript into thinking so.
     * Either way, casting when outside an assignation operation won't compile.
     *
     * Example:
     * ```ts
     * const ModelA = types.model({
     *   n: types.number
     * }).actions(self => ({
     *   setN(aNumber: number) {
     *     self.n = aNumber
     *   }
     * }))
     *
     * const ModelB = types.model({
     *   innerModel: ModelA
     * }).actions(self => ({
     *   someAction() {
     *     // this will allow the compiler to assign a snapshot to the property
     *     self.innerModel = cast({ a: 5 })
     *   }
     * }))
     * ```
     *
     * @param snapshotOrInstance Snapshot or instance
     * @returns The same object casted as an instance
     */
    function cast(snapshotOrInstance) {
        return snapshotOrInstance;
    }

    /**
     * @internal
     * @hidden
     */
    var BaseNode = /** @class */ (function () {
        function BaseNode(type, parent, subpath, environment) {
            this.type = type;
            this.environment = environment;
            this._state = NodeLifeCycle.INITIALIZING;
            this.environment = environment;
            this.baseSetParent(parent, subpath);
        }
        Object.defineProperty(BaseNode.prototype, "subpath", {
            get: function () {
                return this._subpath;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "subpathUponDeath", {
            get: function () {
                return this._subpathUponDeath;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "pathUponDeath", {
            get: function () {
                return this._pathUponDeath;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "value", {
            get: function () {
                return this.type.getValue(this);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "state", {
            get: function () {
                return this._state;
            },
            set: function (val) {
                var wasAlive = this.isAlive;
                this._state = val;
                var isAlive = this.isAlive;
                if (this.aliveAtom && wasAlive !== isAlive) {
                    this.aliveAtom.reportChanged();
                }
            },
            enumerable: true,
            configurable: true
        });
        BaseNode.prototype.fireInternalHook = function (name) {
            if (this._hookSubscribers) {
                this._hookSubscribers.emit(name, this, name);
            }
        };
        BaseNode.prototype.registerHook = function (hook, hookHandler) {
            if (!this._hookSubscribers) {
                this._hookSubscribers = new EventHandlers();
            }
            return this._hookSubscribers.register(hook, hookHandler);
        };
        Object.defineProperty(BaseNode.prototype, "parent", {
            get: function () {
                return this._parent;
            },
            enumerable: true,
            configurable: true
        });
        BaseNode.prototype.baseSetParent = function (parent, subpath) {
            this._parent = parent;
            this._subpath = subpath;
            this._escapedSubpath = undefined; // regenerate when needed
            if (this.pathAtom) {
                this.pathAtom.reportChanged();
            }
        };
        Object.defineProperty(BaseNode.prototype, "path", {
            /*
             * Returns (escaped) path representation as string
             */
            get: function () {
                return this.getEscapedPath(true);
            },
            enumerable: true,
            configurable: true
        });
        BaseNode.prototype.getEscapedPath = function (reportObserved) {
            if (reportObserved) {
                if (!this.pathAtom) {
                    this.pathAtom = createAtom("path");
                }
                this.pathAtom.reportObserved();
            }
            if (!this.parent)
                return "";
            // regenerate escaped subpath if needed
            if (this._escapedSubpath === undefined) {
                this._escapedSubpath = !this._subpath ? "" : escapeJsonPath(this._subpath);
            }
            return this.parent.getEscapedPath(reportObserved) + "/" + this._escapedSubpath;
        };
        Object.defineProperty(BaseNode.prototype, "isRoot", {
            get: function () {
                return this.parent === null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "isAlive", {
            get: function () {
                return this.state !== NodeLifeCycle.DEAD;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "isDetaching", {
            get: function () {
                return this.state === NodeLifeCycle.DETACHING;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseNode.prototype, "observableIsAlive", {
            get: function () {
                if (!this.aliveAtom) {
                    this.aliveAtom = createAtom("alive");
                }
                this.aliveAtom.reportObserved();
                return this.isAlive;
            },
            enumerable: true,
            configurable: true
        });
        BaseNode.prototype.baseFinalizeCreation = function (whenFinalized) {
            if (devMode()) {
                if (!this.isAlive) {
                    // istanbul ignore next
                    throw fail("assertion failed: cannot finalize the creation of a node that is already dead");
                }
            }
            // goal: afterCreate hooks runs depth-first. After attach runs parent first, so on afterAttach the parent has completed already
            if (this.state === NodeLifeCycle.CREATED) {
                if (this.parent) {
                    if (this.parent.state !== NodeLifeCycle.FINALIZED) {
                        // parent not ready yet, postpone
                        return;
                    }
                    this.fireHook(Hook.afterAttach);
                }
                this.state = NodeLifeCycle.FINALIZED;
                if (whenFinalized) {
                    whenFinalized();
                }
            }
        };
        BaseNode.prototype.baseFinalizeDeath = function () {
            if (this._hookSubscribers) {
                this._hookSubscribers.clearAll();
            }
            this._subpathUponDeath = this._subpath;
            this._pathUponDeath = this.getEscapedPath(false);
            this.baseSetParent(null, "");
            this.state = NodeLifeCycle.DEAD;
        };
        BaseNode.prototype.baseAboutToDie = function () {
            this.fireHook(Hook.beforeDestroy);
        };
        return BaseNode;
    }());

    /**
     * @internal
     * @hidden
     */
    var ScalarNode = /** @class */ (function (_super) {
        __extends$1(ScalarNode, _super);
        function ScalarNode(simpleType, parent, subpath, environment, initialSnapshot) {
            var _this = _super.call(this, simpleType, parent, subpath, environment) || this;
            try {
                _this.storedValue = simpleType.createNewInstance(initialSnapshot);
            }
            catch (e) {
                // short-cut to die the instance, to avoid the snapshot computed starting to throw...
                _this.state = NodeLifeCycle.DEAD;
                throw e;
            }
            _this.state = NodeLifeCycle.CREATED;
            // for scalar nodes there's no point in firing this event since it would fire on the constructor, before
            // anybody can actually register for/listen to it
            // this.fireHook(Hook.AfterCreate)
            _this.finalizeCreation();
            return _this;
        }
        Object.defineProperty(ScalarNode.prototype, "root", {
            get: function () {
                // future optimization: store root ref in the node and maintain it
                if (!this.parent)
                    throw fail$1$1("This scalar node is not part of a tree");
                return this.parent.root;
            },
            enumerable: true,
            configurable: true
        });
        ScalarNode.prototype.setParent = function (newParent, subpath) {
            var parentChanged = this.parent !== newParent;
            var subpathChanged = this.subpath !== subpath;
            if (!parentChanged && !subpathChanged) {
                return;
            }
            if (devMode()) {
                if (!subpath) {
                    // istanbul ignore next
                    throw fail$1$1("assertion failed: subpath expected");
                }
                if (!newParent) {
                    // istanbul ignore next
                    throw fail$1$1("assertion failed: parent expected");
                }
                if (parentChanged) {
                    // istanbul ignore next
                    throw fail$1$1("assertion failed: scalar nodes cannot change their parent");
                }
            }
            this.environment = undefined; // use parent's
            this.baseSetParent(this.parent, subpath);
        };
        Object.defineProperty(ScalarNode.prototype, "snapshot", {
            get: function () {
                return freeze(this.getSnapshot());
            },
            enumerable: true,
            configurable: true
        });
        ScalarNode.prototype.getSnapshot = function () {
            return this.type.getSnapshot(this);
        };
        ScalarNode.prototype.toString = function () {
            var path = (this.isAlive ? this.path : this.pathUponDeath) || "<root>";
            return this.type.name + "@" + path + (this.isAlive ? "" : " [dead]");
        };
        ScalarNode.prototype.die = function () {
            if (!this.isAlive || this.state === NodeLifeCycle.DETACHING)
                return;
            this.aboutToDie();
            this.finalizeDeath();
        };
        ScalarNode.prototype.finalizeCreation = function () {
            this.baseFinalizeCreation();
        };
        ScalarNode.prototype.aboutToDie = function () {
            this.baseAboutToDie();
        };
        ScalarNode.prototype.finalizeDeath = function () {
            this.baseFinalizeDeath();
        };
        ScalarNode.prototype.fireHook = function (name) {
            this.fireInternalHook(name);
        };
        __decorate([
            action
        ], ScalarNode.prototype, "die", null);
        return ScalarNode;
    }(BaseNode));

    var nextNodeId = 1;
    var snapshotReactionOptions = {
        onError: function (e) {
            throw e;
        }
    };
    /**
     * @internal
     * @hidden
     */
    var ObjectNode = /** @class */ (function (_super) {
        __extends$1(ObjectNode, _super);
        function ObjectNode(complexType, parent, subpath, environment, initialValue) {
            var _this = _super.call(this, complexType, parent, subpath, environment) || this;
            _this.nodeId = ++nextNodeId;
            _this.isProtectionEnabled = true;
            _this._autoUnbox = true; // unboxing is disabled when reading child nodes
            _this._isRunningAction = false; // only relevant for root
            _this._hasSnapshotReaction = false;
            _this._observableInstanceState = 0 /* UNINITIALIZED */;
            _this._cachedInitialSnapshotCreated = false;
            _this.unbox = _this.unbox.bind(_this);
            _this._initialSnapshot = freeze(initialValue);
            _this.identifierAttribute = complexType.identifierAttribute;
            if (!parent) {
                _this.identifierCache = new IdentifierCache();
            }
            _this._childNodes = complexType.initializeChildNodes(_this, _this._initialSnapshot);
            // identifier can not be changed during lifecycle of a node
            // so we safely can read it from initial snapshot
            _this.identifier = null;
            _this.unnormalizedIdentifier = null;
            if (_this.identifierAttribute && _this._initialSnapshot) {
                var id = _this._initialSnapshot[_this.identifierAttribute];
                if (id === undefined) {
                    // try with the actual node if not (for optional identifiers)
                    var childNode = _this._childNodes[_this.identifierAttribute];
                    if (childNode) {
                        id = childNode.value;
                    }
                }
                if (typeof id !== "string" && typeof id !== "number") {
                    throw fail$1$1("Instance identifier '" + _this.identifierAttribute + "' for type '" + _this.type.name + "' must be a string or a number");
                }
                // normalize internal identifier to string
                _this.identifier = normalizeIdentifier(id);
                _this.unnormalizedIdentifier = id;
            }
            if (!parent) {
                _this.identifierCache.addNodeToCache(_this);
            }
            else {
                parent.root.identifierCache.addNodeToCache(_this);
            }
            return _this;
        }
        ObjectNode.prototype.applyPatches = function (patches) {
            this.createObservableInstanceIfNeeded();
            this._applyPatches(patches);
        };
        ObjectNode.prototype.applySnapshot = function (snapshot) {
            this.createObservableInstanceIfNeeded();
            this._applySnapshot(snapshot);
        };
        ObjectNode.prototype.createObservableInstanceIfNeeded = function () {
            if (this._observableInstanceState === 0 /* UNINITIALIZED */) {
                this.createObservableInstance();
            }
        };
        ObjectNode.prototype.createObservableInstance = function () {
            var e_1, _a;
            if (devMode()) {
                if (this.state !== NodeLifeCycle.INITIALIZING) {
                    // istanbul ignore next
                    throw fail$1$1("assertion failed: the creation of the observable instance must be done on the initializing phase");
                }
            }
            this._observableInstanceState = 1 /* CREATING */;
            // make sure the parent chain is created as well
            // array with parent chain from parent to child
            var parentChain = [];
            var parent = this.parent;
            // for performance reasons we never go back further than the most direct
            // uninitialized parent
            // this is done to avoid traversing the whole tree to the root when using
            // the same reference again
            while (parent &&
                parent._observableInstanceState === 0 /* UNINITIALIZED */) {
                parentChain.unshift(parent);
                parent = parent.parent;
            }
            try {
                // initialize the uninitialized parent chain from parent to child
                for (var parentChain_1 = __values$1(parentChain), parentChain_1_1 = parentChain_1.next(); !parentChain_1_1.done; parentChain_1_1 = parentChain_1.next()) {
                    var p = parentChain_1_1.value;
                    p.createObservableInstanceIfNeeded();
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (parentChain_1_1 && !parentChain_1_1.done && (_a = parentChain_1.return)) _a.call(parentChain_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            var type = this.type;
            try {
                this.storedValue = type.createNewInstance(this._childNodes);
                this.preboot();
                this._isRunningAction = true;
                type.finalizeNewInstance(this, this.storedValue);
            }
            catch (e) {
                // short-cut to die the instance, to avoid the snapshot computed starting to throw...
                this.state = NodeLifeCycle.DEAD;
                throw e;
            }
            finally {
                this._isRunningAction = false;
            }
            this._observableInstanceState = 2 /* CREATED */;
            // NOTE: we need to touch snapshot, because non-observable
            // "_observableInstanceState" field was touched
            invalidateComputed(this, "snapshot");
            if (this.isRoot)
                this._addSnapshotReaction();
            this._childNodes = EMPTY_OBJECT$1;
            this.state = NodeLifeCycle.CREATED;
            this.fireHook(Hook.afterCreate);
            this.finalizeCreation();
        };
        Object.defineProperty(ObjectNode.prototype, "root", {
            get: function () {
                var parent = this.parent;
                return parent ? parent.root : this;
            },
            enumerable: true,
            configurable: true
        });
        ObjectNode.prototype.clearParent = function () {
            if (!this.parent)
                return;
            // detach if attached
            this.fireHook(Hook.beforeDetach);
            var previousState = this.state;
            this.state = NodeLifeCycle.DETACHING;
            var root = this.root;
            var newEnv = root.environment;
            var newIdCache = root.identifierCache.splitCache(this);
            try {
                this.parent.removeChild(this.subpath);
                this.baseSetParent(null, "");
                this.environment = newEnv;
                this.identifierCache = newIdCache;
            }
            finally {
                this.state = previousState;
            }
        };
        ObjectNode.prototype.setParent = function (newParent, subpath) {
            var parentChanged = newParent !== this.parent;
            var subpathChanged = subpath !== this.subpath;
            if (!parentChanged && !subpathChanged) {
                return;
            }
            if (devMode()) {
                if (!subpath) {
                    // istanbul ignore next
                    throw fail$1$1("assertion failed: subpath expected");
                }
                if (!newParent) {
                    // istanbul ignore next
                    throw fail$1$1("assertion failed: new parent expected");
                }
                if (this.parent && parentChanged) {
                    throw fail$1$1("A node cannot exists twice in the state tree. Failed to add " + this + " to path '" + newParent.path + "/" + subpath + "'.");
                }
                if (!this.parent && newParent.root === this) {
                    throw fail$1$1("A state tree is not allowed to contain itself. Cannot assign " + this + " to path '" + newParent.path + "/" + subpath + "'");
                }
                if (!this.parent &&
                    !!this.environment &&
                    this.environment !== newParent.root.environment) {
                    throw fail$1$1("A state tree cannot be made part of another state tree as long as their environments are different.");
                }
            }
            if (parentChanged) {
                // attach to new parent
                this.environment = undefined; // will use root's
                newParent.root.identifierCache.mergeCache(this);
                this.baseSetParent(newParent, subpath);
                this.fireHook(Hook.afterAttach);
            }
            else if (subpathChanged) {
                // moving to a new subpath on the same parent
                this.baseSetParent(this.parent, subpath);
            }
        };
        ObjectNode.prototype.fireHook = function (name) {
            var _this = this;
            this.fireInternalHook(name);
            var fn = this.storedValue &&
                typeof this.storedValue === "object" &&
                this.storedValue[name];
            if (typeof fn === "function") {
                // we check for it to allow old mobx peer dependencies that don't have the method to work (even when still bugged)
                if (allowStateChangesInsideComputed) {
                    allowStateChangesInsideComputed(function () {
                        fn.apply(_this.storedValue);
                    });
                }
                else {
                    fn.apply(this.storedValue);
                }
            }
        };
        Object.defineProperty(ObjectNode.prototype, "snapshot", {
            // advantage of using computed for a snapshot is that nicely respects transactions etc.
            get: function () {
                return freeze(this.getSnapshot());
            },
            enumerable: true,
            configurable: true
        });
        // NOTE: we use this method to get snapshot without creating @computed overhead
        ObjectNode.prototype.getSnapshot = function () {
            if (!this.isAlive)
                return this._snapshotUponDeath;
            return this._observableInstanceState === 2 /* CREATED */
                ? this._getActualSnapshot()
                : this._getCachedInitialSnapshot();
        };
        ObjectNode.prototype._getActualSnapshot = function () {
            return this.type.getSnapshot(this);
        };
        ObjectNode.prototype._getCachedInitialSnapshot = function () {
            if (!this._cachedInitialSnapshotCreated) {
                var type = this.type;
                var childNodes = this._childNodes;
                var snapshot = this._initialSnapshot;
                this._cachedInitialSnapshot = type.processInitialSnapshot(childNodes, snapshot);
                this._cachedInitialSnapshotCreated = true;
            }
            return this._cachedInitialSnapshot;
        };
        ObjectNode.prototype.isRunningAction = function () {
            if (this._isRunningAction)
                return true;
            if (this.isRoot)
                return false;
            return this.parent.isRunningAction();
        };
        ObjectNode.prototype.assertAlive = function (context) {
            var livelinessChecking = getLivelinessChecking();
            if (!this.isAlive && livelinessChecking !== "ignore") {
                var error = this._getAssertAliveError(context);
                switch (livelinessChecking) {
                    case "error":
                        throw fail$1$1(error);
                    case "warn":
                        warnError(error);
                }
            }
        };
        ObjectNode.prototype._getAssertAliveError = function (context) {
            var escapedPath = this.getEscapedPath(false) || this.pathUponDeath || "";
            var subpath = (context.subpath && escapeJsonPath(context.subpath)) || "";
            var actionContext = context.actionContext || getCurrentActionContext();
            // try to use a real action context if possible since it includes the action name
            if (actionContext && actionContext.type !== "action" && actionContext.parentActionEvent) {
                actionContext = actionContext.parentActionEvent;
            }
            var actionFullPath = "";
            if (actionContext && actionContext.name != null) {
                // try to use the context, and if it not available use the node one
                var actionPath = (actionContext && actionContext.context && getPath(actionContext.context)) ||
                    escapedPath;
                actionFullPath = actionPath + "." + actionContext.name + "()";
            }
            return "You are trying to read or write to an object that is no longer part of a state tree. (Object type: '" + this.type.name + "', Path upon death: '" + escapedPath + "', Subpath: '" + subpath + "', Action: '" + actionFullPath + "'). Either detach nodes first, or don't use objects after removing / replacing them in the tree.";
        };
        ObjectNode.prototype.getChildNode = function (subpath) {
            this.assertAlive({
                subpath: subpath
            });
            this._autoUnbox = false;
            try {
                return this._observableInstanceState === 2 /* CREATED */
                    ? this.type.getChildNode(this, subpath)
                    : this._childNodes[subpath];
            }
            finally {
                this._autoUnbox = true;
            }
        };
        ObjectNode.prototype.getChildren = function () {
            this.assertAlive(EMPTY_OBJECT$1);
            this._autoUnbox = false;
            try {
                return this._observableInstanceState === 2 /* CREATED */
                    ? this.type.getChildren(this)
                    : convertChildNodesToArray(this._childNodes);
            }
            finally {
                this._autoUnbox = true;
            }
        };
        ObjectNode.prototype.getChildType = function (propertyName) {
            return this.type.getChildType(propertyName);
        };
        Object.defineProperty(ObjectNode.prototype, "isProtected", {
            get: function () {
                return this.root.isProtectionEnabled;
            },
            enumerable: true,
            configurable: true
        });
        ObjectNode.prototype.assertWritable = function (context) {
            this.assertAlive(context);
            if (!this.isRunningAction() && this.isProtected) {
                throw fail$1$1("Cannot modify '" + this + "', the object is protected and can only be modified by using an action.");
            }
        };
        ObjectNode.prototype.removeChild = function (subpath) {
            this.type.removeChild(this, subpath);
        };
        // bound on the constructor
        ObjectNode.prototype.unbox = function (childNode) {
            if (!childNode)
                return childNode;
            this.assertAlive({
                subpath: childNode.subpath || childNode.subpathUponDeath
            });
            return this._autoUnbox ? childNode.value : childNode;
        };
        ObjectNode.prototype.toString = function () {
            var path = (this.isAlive ? this.path : this.pathUponDeath) || "<root>";
            var identifier = this.identifier ? "(id: " + this.identifier + ")" : "";
            return this.type.name + "@" + path + identifier + (this.isAlive ? "" : " [dead]");
        };
        ObjectNode.prototype.finalizeCreation = function () {
            var _this = this;
            this.baseFinalizeCreation(function () {
                var e_2, _a;
                try {
                    for (var _b = __values$1(_this.getChildren()), _c = _b.next(); !_c.done; _c = _b.next()) {
                        var child = _c.value;
                        child.finalizeCreation();
                    }
                }
                catch (e_2_1) { e_2 = { error: e_2_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                    }
                    finally { if (e_2) throw e_2.error; }
                }
                _this.fireInternalHook(Hook.afterCreationFinalization);
            });
        };
        ObjectNode.prototype.detach = function () {
            if (!this.isAlive)
                throw fail$1$1("Error while detaching, node is not alive.");
            this.clearParent();
        };
        ObjectNode.prototype.preboot = function () {
            var self = this;
            this._applyPatches = createActionInvoker(this.storedValue, "@APPLY_PATCHES", function (patches) {
                patches.forEach(function (patch) {
                    var parts = splitJsonPath(patch.path);
                    var node = resolveNodeByPathParts(self, parts.slice(0, -1));
                    node.applyPatchLocally(parts[parts.length - 1], patch);
                });
            });
            this._applySnapshot = createActionInvoker(this.storedValue, "@APPLY_SNAPSHOT", function (snapshot) {
                // if the snapshot is the same as the current one, avoid performing a reconcile
                if (snapshot === self.snapshot)
                    return;
                // else, apply it by calling the type logic
                return self.type.applySnapshot(self, snapshot);
            });
            addHiddenFinalProp$1(this.storedValue, "$treenode", this);
            addHiddenFinalProp$1(this.storedValue, "toJSON", toJSON);
        };
        ObjectNode.prototype.die = function () {
            if (!this.isAlive || this.state === NodeLifeCycle.DETACHING)
                return;
            this.aboutToDie();
            this.finalizeDeath();
        };
        ObjectNode.prototype.aboutToDie = function () {
            if (this._observableInstanceState === 0 /* UNINITIALIZED */) {
                return;
            }
            this.getChildren().forEach(function (node) {
                node.aboutToDie();
            });
            // beforeDestroy should run before the disposers since else we could end up in a situation where
            // a disposer added with addDisposer at this stage (beforeDestroy) is actually never released
            this.baseAboutToDie();
            this._internalEventsEmit("dispose" /* Dispose */);
            this._internalEventsClear("dispose" /* Dispose */);
        };
        ObjectNode.prototype.finalizeDeath = function () {
            // invariant: not called directly but from "die"
            this.getChildren().forEach(function (node) {
                node.finalizeDeath();
            });
            this.root.identifierCache.notifyDied(this);
            // "kill" the computed prop and just store the last snapshot
            var snapshot = this.snapshot;
            this._snapshotUponDeath = snapshot;
            this._internalEventsClearAll();
            this.baseFinalizeDeath();
        };
        ObjectNode.prototype.onSnapshot = function (onChange) {
            this._addSnapshotReaction();
            return this._internalEventsRegister("snapshot" /* Snapshot */, onChange);
        };
        ObjectNode.prototype.emitSnapshot = function (snapshot) {
            this._internalEventsEmit("snapshot" /* Snapshot */, snapshot);
        };
        ObjectNode.prototype.onPatch = function (handler) {
            return this._internalEventsRegister("patch" /* Patch */, handler);
        };
        ObjectNode.prototype.emitPatch = function (basePatch, source) {
            if (this._internalEventsHasSubscribers("patch" /* Patch */)) {
                var localizedPatch = extend({}, basePatch, {
                    path: source.path.substr(this.path.length) + "/" + basePatch.path // calculate the relative path of the patch
                });
                var _a = __read$1(splitPatch(localizedPatch), 2), patch = _a[0], reversePatch = _a[1];
                this._internalEventsEmit("patch" /* Patch */, patch, reversePatch);
            }
            if (this.parent)
                this.parent.emitPatch(basePatch, source);
        };
        ObjectNode.prototype.hasDisposer = function (disposer) {
            return this._internalEventsHas("dispose" /* Dispose */, disposer);
        };
        ObjectNode.prototype.addDisposer = function (disposer) {
            if (!this.hasDisposer(disposer)) {
                this._internalEventsRegister("dispose" /* Dispose */, disposer, true);
                return;
            }
            throw fail$1$1("cannot add a disposer when it is already registered for execution");
        };
        ObjectNode.prototype.removeDisposer = function (disposer) {
            if (!this._internalEventsHas("dispose" /* Dispose */, disposer)) {
                throw fail$1$1("cannot remove a disposer which was never registered for execution");
            }
            this._internalEventsUnregister("dispose" /* Dispose */, disposer);
        };
        ObjectNode.prototype.removeMiddleware = function (middleware) {
            if (this.middlewares) {
                var index = this.middlewares.indexOf(middleware);
                if (index >= 0) {
                    this.middlewares.splice(index, 1);
                }
            }
        };
        ObjectNode.prototype.addMiddleWare = function (handler, includeHooks) {
            var _this = this;
            if (includeHooks === void 0) { includeHooks = true; }
            var middleware = { handler: handler, includeHooks: includeHooks };
            if (!this.middlewares)
                this.middlewares = [middleware];
            else
                this.middlewares.push(middleware);
            return function () {
                _this.removeMiddleware(middleware);
            };
        };
        ObjectNode.prototype.applyPatchLocally = function (subpath, patch) {
            this.assertWritable({
                subpath: subpath
            });
            this.createObservableInstanceIfNeeded();
            this.type.applyPatchLocally(this, subpath, patch);
        };
        ObjectNode.prototype._addSnapshotReaction = function () {
            var _this = this;
            if (!this._hasSnapshotReaction) {
                var snapshotDisposer = reaction(function () { return _this.snapshot; }, function (snapshot) { return _this.emitSnapshot(snapshot); }, snapshotReactionOptions);
                this.addDisposer(snapshotDisposer);
                this._hasSnapshotReaction = true;
            }
        };
        // we proxy the methods to avoid creating an EventHandlers instance when it is not needed
        ObjectNode.prototype._internalEventsHasSubscribers = function (event) {
            return !!this._internalEvents && this._internalEvents.hasSubscribers(event);
        };
        ObjectNode.prototype._internalEventsRegister = function (event, eventHandler, atTheBeginning) {
            if (atTheBeginning === void 0) { atTheBeginning = false; }
            if (!this._internalEvents) {
                this._internalEvents = new EventHandlers();
            }
            return this._internalEvents.register(event, eventHandler, atTheBeginning);
        };
        ObjectNode.prototype._internalEventsHas = function (event, eventHandler) {
            return !!this._internalEvents && this._internalEvents.has(event, eventHandler);
        };
        ObjectNode.prototype._internalEventsUnregister = function (event, eventHandler) {
            if (this._internalEvents) {
                this._internalEvents.unregister(event, eventHandler);
            }
        };
        ObjectNode.prototype._internalEventsEmit = function (event) {
            var _a;
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            if (this._internalEvents) {
                (_a = this._internalEvents).emit.apply(_a, __spread$1([event], args));
            }
        };
        ObjectNode.prototype._internalEventsClear = function (event) {
            if (this._internalEvents) {
                this._internalEvents.clear(event);
            }
        };
        ObjectNode.prototype._internalEventsClearAll = function () {
            if (this._internalEvents) {
                this._internalEvents.clearAll();
            }
        };
        __decorate([
            action
        ], ObjectNode.prototype, "createObservableInstance", null);
        __decorate([
            computed
        ], ObjectNode.prototype, "snapshot", null);
        __decorate([
            action
        ], ObjectNode.prototype, "detach", null);
        __decorate([
            action
        ], ObjectNode.prototype, "die", null);
        return ObjectNode;
    }(BaseNode));

    /**
     * @internal
     * @hidden
     */
    var TypeFlags;
    (function (TypeFlags) {
        TypeFlags[TypeFlags["String"] = 1] = "String";
        TypeFlags[TypeFlags["Number"] = 2] = "Number";
        TypeFlags[TypeFlags["Boolean"] = 4] = "Boolean";
        TypeFlags[TypeFlags["Date"] = 8] = "Date";
        TypeFlags[TypeFlags["Literal"] = 16] = "Literal";
        TypeFlags[TypeFlags["Array"] = 32] = "Array";
        TypeFlags[TypeFlags["Map"] = 64] = "Map";
        TypeFlags[TypeFlags["Object"] = 128] = "Object";
        TypeFlags[TypeFlags["Frozen"] = 256] = "Frozen";
        TypeFlags[TypeFlags["Optional"] = 512] = "Optional";
        TypeFlags[TypeFlags["Reference"] = 1024] = "Reference";
        TypeFlags[TypeFlags["Identifier"] = 2048] = "Identifier";
        TypeFlags[TypeFlags["Late"] = 4096] = "Late";
        TypeFlags[TypeFlags["Refinement"] = 8192] = "Refinement";
        TypeFlags[TypeFlags["Union"] = 16384] = "Union";
        TypeFlags[TypeFlags["Null"] = 32768] = "Null";
        TypeFlags[TypeFlags["Undefined"] = 65536] = "Undefined";
        TypeFlags[TypeFlags["Integer"] = 131072] = "Integer";
        TypeFlags[TypeFlags["Custom"] = 262144] = "Custom";
        TypeFlags[TypeFlags["SnapshotProcessor"] = 524288] = "SnapshotProcessor";
    })(TypeFlags || (TypeFlags = {}));
    /**
     * @internal
     * @hidden
     */
    var cannotDetermineSubtype = "cannotDetermine";
    /**
     * A base type produces a MST node (Node in the state tree)
     *
     * @internal
     * @hidden
     */
    var BaseType = /** @class */ (function () {
        function BaseType(name) {
            this.isType = true;
            this.name = name;
        }
        BaseType.prototype.create = function (snapshot, environment) {
            typecheckInternal(this, snapshot);
            return this.instantiate(null, "", environment, snapshot).value;
        };
        BaseType.prototype.getSnapshot = function (node, applyPostProcess) {
            // istanbul ignore next
            throw fail$1$1("unimplemented method");
        };
        BaseType.prototype.isAssignableFrom = function (type) {
            return type === this;
        };
        BaseType.prototype.validate = function (value, context) {
            var node = getStateTreeNodeSafe(value);
            if (node) {
                var valueType = getType(value);
                return this.isAssignableFrom(valueType)
                    ? typeCheckSuccess()
                    : typeCheckFailure(context, value);
                // it is tempting to compare snapshots, but in that case we should always clone on assignments...
            }
            return this.isValidSnapshot(value, context);
        };
        BaseType.prototype.is = function (thing) {
            return this.validate(thing, [{ path: "", type: this }]).length === 0;
        };
        Object.defineProperty(BaseType.prototype, "Type", {
            get: function () {
                // istanbul ignore next
                throw fail$1$1("Factory.Type should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.Type`");
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseType.prototype, "TypeWithoutSTN", {
            get: function () {
                // istanbul ignore next
                throw fail$1$1("Factory.TypeWithoutSTN should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.TypeWithoutSTN`");
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseType.prototype, "SnapshotType", {
            get: function () {
                // istanbul ignore next
                throw fail$1$1("Factory.SnapshotType should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.SnapshotType`");
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BaseType.prototype, "CreationType", {
            get: function () {
                // istanbul ignore next
                throw fail$1$1("Factory.CreationType should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.CreationType`");
            },
            enumerable: true,
            configurable: true
        });
        __decorate([
            action
        ], BaseType.prototype, "create", null);
        return BaseType;
    }());
    /**
     * A complex type produces a MST node (Node in the state tree)
     *
     * @internal
     * @hidden
     */
    var ComplexType = /** @class */ (function (_super) {
        __extends$1(ComplexType, _super);
        function ComplexType(name) {
            return _super.call(this, name) || this;
        }
        ComplexType.prototype.create = function (snapshot, environment) {
            if (snapshot === void 0) { snapshot = this.getDefaultSnapshot(); }
            return _super.prototype.create.call(this, snapshot, environment);
        };
        ComplexType.prototype.getValue = function (node) {
            node.createObservableInstanceIfNeeded();
            return node.storedValue;
        };
        ComplexType.prototype.tryToReconcileNode = function (current, newValue) {
            if (current.isDetaching)
                return false;
            if (current.snapshot === newValue) {
                // newValue is the current snapshot of the node, noop
                return true;
            }
            if (isStateTreeNode(newValue) && getStateTreeNode(newValue) === current) {
                // the current node is the same as the new one
                return true;
            }
            if (current.type === this &&
                isMutable(newValue) &&
                !isStateTreeNode(newValue) &&
                (!current.identifierAttribute ||
                    current.identifier ===
                        normalizeIdentifier(newValue[current.identifierAttribute]))) {
                // the newValue has no node, so can be treated like a snapshot
                // we can reconcile
                current.applySnapshot(newValue);
                return true;
            }
            return false;
        };
        ComplexType.prototype.reconcile = function (current, newValue, parent, subpath) {
            var nodeReconciled = this.tryToReconcileNode(current, newValue);
            if (nodeReconciled) {
                current.setParent(parent, subpath);
                return current;
            }
            // current node cannot be recycled in any way
            current.die(); // noop if detaching
            // attempt to reuse the new one
            if (isStateTreeNode(newValue) && this.isAssignableFrom(getType(newValue))) {
                // newValue is a Node as well, move it here..
                var newNode = getStateTreeNode(newValue);
                newNode.setParent(parent, subpath);
                return newNode;
            }
            // nothing to do, we have to create a new node
            return this.instantiate(parent, subpath, undefined, newValue);
        };
        ComplexType.prototype.getSubTypes = function () {
            return null;
        };
        __decorate([
            action
        ], ComplexType.prototype, "create", null);
        return ComplexType;
    }(BaseType));
    /**
     * @internal
     * @hidden
     */
    var SimpleType = /** @class */ (function (_super) {
        __extends$1(SimpleType, _super);
        function SimpleType() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        SimpleType.prototype.createNewInstance = function (snapshot) {
            return snapshot;
        };
        SimpleType.prototype.getValue = function (node) {
            // if we ever find a case where scalar nodes can be accessed without iterating through its parent
            // uncomment this to make sure the parent chain is created when this is accessed
            // if (node.parent) {
            //     node.parent.createObservableInstanceIfNeeded()
            // }
            return node.storedValue;
        };
        SimpleType.prototype.getSnapshot = function (node) {
            return node.storedValue;
        };
        SimpleType.prototype.reconcile = function (current, newValue, parent, subpath) {
            // reconcile only if type and value are still the same, and only if the node is not detaching
            if (!current.isDetaching && current.type === this && current.storedValue === newValue) {
                return current;
            }
            var res = this.instantiate(parent, subpath, undefined, newValue);
            current.die(); // noop if detaching
            return res;
        };
        SimpleType.prototype.getSubTypes = function () {
            return null;
        };
        return SimpleType;
    }(BaseType));
    /**
     * Returns if a given value represents a type.
     *
     * @param value Value to check.
     * @returns `true` if the value is a type.
     */
    function isType(value) {
        return typeof value === "object" && value && value.isType === true;
    }
    /**
     * @internal
     * @hidden
     */
    function assertIsType(type, argNumber) {
        assertArg(type, isType, "mobx-state-tree type", argNumber);
    }

    var RunningAction = /** @class */ (function () {
        function RunningAction(hooks, call) {
            this.hooks = hooks;
            this.call = call;
            this.flowsPending = 0;
            this.running = true;
            if (hooks) {
                hooks.onStart(call);
            }
        }
        RunningAction.prototype.finish = function (error) {
            if (this.running) {
                this.running = false;
                if (this.hooks) {
                    this.hooks.onFinish(this.call, error);
                }
            }
        };
        RunningAction.prototype.incFlowsPending = function () {
            this.flowsPending++;
        };
        RunningAction.prototype.decFlowsPending = function () {
            this.flowsPending--;
        };
        Object.defineProperty(RunningAction.prototype, "hasFlowsPending", {
            get: function () {
                return this.flowsPending > 0;
            },
            enumerable: true,
            configurable: true
        });
        return RunningAction;
    }());

    var nextActionId$1 = 1;
    var currentActionContext;
    /**
     * @internal
     * @hidden
     */
    function getCurrentActionContext() {
        return currentActionContext;
    }
    /**
     * @internal
     * @hidden
     */
    function getNextActionId() {
        return nextActionId$1++;
    }
    // TODO: optimize away entire action context if there is no middleware in tree?
    /**
     * @internal
     * @hidden
     */
    function runWithActionContext(context, fn) {
        var node = getStateTreeNode(context.context);
        if (context.type === "action") {
            node.assertAlive({
                actionContext: context
            });
        }
        var baseIsRunningAction = node._isRunningAction;
        node._isRunningAction = true;
        var previousContext = currentActionContext;
        currentActionContext = context;
        try {
            return runMiddleWares(node, context, fn);
        }
        finally {
            currentActionContext = previousContext;
            node._isRunningAction = baseIsRunningAction;
        }
    }
    /**
     * @internal
     * @hidden
     */
    function getParentActionContext(parentContext) {
        if (!parentContext)
            return undefined;
        if (parentContext.type === "action")
            return parentContext;
        return parentContext.parentActionEvent;
    }
    /**
     * @internal
     * @hidden
     */
    function createActionInvoker(target, name, fn) {
        var res = function () {
            var id = getNextActionId();
            var parentContext = currentActionContext;
            var parentActionContext = getParentActionContext(parentContext);
            return runWithActionContext({
                type: "action",
                name: name,
                id: id,
                args: argsToArray(arguments),
                context: target,
                tree: getRoot(target),
                rootId: parentContext ? parentContext.rootId : id,
                parentId: parentContext ? parentContext.id : 0,
                allParentIds: parentContext
                    ? __spread$1(parentContext.allParentIds, [parentContext.id]) : [],
                parentEvent: parentContext,
                parentActionEvent: parentActionContext
            }, fn);
        };
        res._isMSTAction = true;
        return res;
    }
    var CollectedMiddlewares = /** @class */ (function () {
        function CollectedMiddlewares(node, fn) {
            this.arrayIndex = 0;
            this.inArrayIndex = 0;
            this.middlewares = [];
            // we just push middleware arrays into an array of arrays to avoid making copies
            if (fn.$mst_middleware) {
                this.middlewares.push(fn.$mst_middleware);
            }
            var n = node;
            // Find all middlewares. Optimization: cache this?
            while (n) {
                if (n.middlewares)
                    this.middlewares.push(n.middlewares);
                n = n.parent;
            }
        }
        Object.defineProperty(CollectedMiddlewares.prototype, "isEmpty", {
            get: function () {
                return this.middlewares.length <= 0;
            },
            enumerable: true,
            configurable: true
        });
        CollectedMiddlewares.prototype.getNextMiddleware = function () {
            var array = this.middlewares[this.arrayIndex];
            if (!array)
                return undefined;
            var item = array[this.inArrayIndex++];
            if (!item) {
                this.arrayIndex++;
                this.inArrayIndex = 0;
                return this.getNextMiddleware();
            }
            return item;
        };
        return CollectedMiddlewares;
    }());
    function runMiddleWares(node, baseCall, originalFn) {
        var middlewares = new CollectedMiddlewares(node, originalFn);
        // Short circuit
        if (middlewares.isEmpty)
            return action(originalFn).apply(null, baseCall.args);
        var result = null;
        function runNextMiddleware(call) {
            var middleware = middlewares.getNextMiddleware();
            var handler = middleware && middleware.handler;
            if (!handler) {
                return action(originalFn).apply(null, call.args);
            }
            // skip hooks if asked to
            if (!middleware.includeHooks && Hook[call.name]) {
                return runNextMiddleware(call);
            }
            var nextInvoked = false;
            function next(call2, callback) {
                nextInvoked = true;
                // the result can contain
                // - the non manipulated return value from an action
                // - the non manipulated abort value
                // - one of the above but manipulated through the callback function
                result = runNextMiddleware(call2);
                if (callback) {
                    result = callback(result);
                }
            }
            var abortInvoked = false;
            function abort(value) {
                abortInvoked = true;
                // overwrite the result
                // can be manipulated through middlewares earlier in the queue using the callback fn
                result = value;
            }
            handler(call, next, abort);
            if (devMode()) {
                if (!nextInvoked && !abortInvoked) {
                    var node2 = getStateTreeNode(call.tree);
                    throw fail$1$1("Neither the next() nor the abort() callback within the middleware " + handler.name + " for the action: \"" + call.name + "\" on the node: " + node2.type.name + " was invoked.");
                }
                else if (nextInvoked && abortInvoked) {
                    var node2 = getStateTreeNode(call.tree);
                    throw fail$1$1("The next() and abort() callback within the middleware " + handler.name + " for the action: \"" + call.name + "\" on the node: " + node2.type.name + " were invoked.");
                }
            }
            return result;
        }
        return runNextMiddleware(baseCall);
    }

    function safeStringify(value) {
        try {
            return JSON.stringify(value);
        }
        catch (e) {
            // istanbul ignore next
            return "<Unserializable: " + e + ">";
        }
    }
    /**
     * @internal
     * @hidden
     */
    function prettyPrintValue(value) {
        return typeof value === "function"
            ? "<function" + (value.name ? " " + value.name : "") + ">"
            : isStateTreeNode(value)
                ? "<" + value + ">"
                : "`" + safeStringify(value) + "`";
    }
    function shortenPrintValue(valueInString) {
        return valueInString.length < 280
            ? valueInString
            : valueInString.substring(0, 272) + "......" + valueInString.substring(valueInString.length - 8);
    }
    function toErrorString(error) {
        var value = error.value;
        var type = error.context[error.context.length - 1].type;
        var fullPath = error.context
            .map(function (_a) {
            var path = _a.path;
            return path;
        })
            .filter(function (path) { return path.length > 0; })
            .join("/");
        var pathPrefix = fullPath.length > 0 ? "at path \"/" + fullPath + "\" " : "";
        var currentTypename = isStateTreeNode(value)
            ? "value of type " + getStateTreeNode(value).type.name + ":"
            : isPrimitive$1(value)
                ? "value"
                : "snapshot";
        var isSnapshotCompatible = type && isStateTreeNode(value) && type.is(getStateTreeNode(value).snapshot);
        return ("" + pathPrefix + currentTypename + " " + prettyPrintValue(value) + " is not assignable " + (type ? "to type: `" + type.name + "`" : "") +
            (error.message ? " (" + error.message + ")" : "") +
            (type
                ? isPrimitiveType(type) || isPrimitive$1(value)
                    ? "."
                    : ", expected an instance of `" + type.name + "` or a snapshot like `" + type.describe() + "` instead." +
                        (isSnapshotCompatible
                            ? " (Note that a snapshot of the provided value is compatible with the targeted type)"
                            : "")
                : "."));
    }
    /**
     * @internal
     * @hidden
     */
    function getContextForPath(context, path, type) {
        return context.concat([{ path: path, type: type }]);
    }
    /**
     * @internal
     * @hidden
     */
    function typeCheckSuccess() {
        return EMPTY_ARRAY$1;
    }
    /**
     * @internal
     * @hidden
     */
    function typeCheckFailure(context, value, message) {
        return [{ context: context, value: value, message: message }];
    }
    /**
     * @internal
     * @hidden
     */
    function flattenTypeErrors(errors) {
        return errors.reduce(function (a, i) { return a.concat(i); }, []);
    }
    // TODO; doublecheck: typecheck should only needed to be invoked from: type.create and array / map / value.property will change
    /**
     * @internal
     * @hidden
     */
    function typecheckInternal(type, value) {
        // runs typeChecking if it is in dev-mode or through a process.env.ENABLE_TYPE_CHECK flag
        if (isTypeCheckingEnabled()) {
            typecheck(type, value);
        }
    }
    /**
     * Run's the typechecker for the given type on the given value, which can be a snapshot or an instance.
     * Throws if the given value is not according the provided type specification.
     * Use this if you need typechecks even in a production build (by default all automatic runtime type checks will be skipped in production builds)
     *
     * @param type Type to check against.
     * @param value Value to be checked, either a snapshot or an instance.
     */
    function typecheck(type, value) {
        var errors = type.validate(value, [{ path: "", type: type }]);
        if (errors.length > 0) {
            throw fail$1$1(validationErrorsToString(type, value, errors));
        }
    }
    function validationErrorsToString(type, value, errors) {
        if (errors.length === 0) {
            return undefined;
        }
        return ("Error while converting " + shortenPrintValue(prettyPrintValue(value)) + " to `" + type.name + "`:\n\n    " + errors.map(toErrorString).join("\n    "));
    }

    var identifierCacheId = 0;
    /**
     * @internal
     * @hidden
     */
    var IdentifierCache = /** @class */ (function () {
        function IdentifierCache() {
            this.cacheId = identifierCacheId++;
            // n.b. in cache all identifiers are normalized to strings
            this.cache = observable.map();
            // last time the cache (array) for a given time changed
            // n.b. it is not really the time, but just an integer that gets increased after each modification to the array
            this.lastCacheModificationPerId = observable.map();
        }
        IdentifierCache.prototype.updateLastCacheModificationPerId = function (identifier) {
            var lcm = this.lastCacheModificationPerId.get(identifier);
            // we start at 1 since 0 means no update since cache creation
            this.lastCacheModificationPerId.set(identifier, lcm === undefined ? 1 : lcm + 1);
        };
        IdentifierCache.prototype.getLastCacheModificationPerId = function (identifier) {
            var modificationId = this.lastCacheModificationPerId.get(identifier) || 0;
            return this.cacheId + "-" + modificationId;
        };
        IdentifierCache.prototype.addNodeToCache = function (node, lastCacheUpdate) {
            if (lastCacheUpdate === void 0) { lastCacheUpdate = true; }
            if (node.identifierAttribute) {
                var identifier = node.identifier;
                if (!this.cache.has(identifier)) {
                    this.cache.set(identifier, observable.array([], mobxShallow));
                }
                var set = this.cache.get(identifier);
                if (set.indexOf(node) !== -1)
                    throw fail$1$1("Already registered");
                set.push(node);
                if (lastCacheUpdate) {
                    this.updateLastCacheModificationPerId(identifier);
                }
            }
        };
        IdentifierCache.prototype.mergeCache = function (node) {
            var _this = this;
            values(node.identifierCache.cache).forEach(function (nodes) {
                return nodes.forEach(function (child) {
                    _this.addNodeToCache(child);
                });
            });
        };
        IdentifierCache.prototype.notifyDied = function (node) {
            if (node.identifierAttribute) {
                var id = node.identifier;
                var set = this.cache.get(id);
                if (set) {
                    set.remove(node);
                    // remove empty sets from cache
                    if (!set.length) {
                        this.cache.delete(id);
                    }
                    this.updateLastCacheModificationPerId(node.identifier);
                }
            }
        };
        IdentifierCache.prototype.splitCache = function (node) {
            var _this = this;
            var res = new IdentifierCache();
            var basePath = node.path;
            entries(this.cache).forEach(function (_a) {
                var _b = __read$1(_a, 2), id = _b[0], nodes = _b[1];
                var modified = false;
                for (var i = nodes.length - 1; i >= 0; i--) {
                    if (nodes[i].path.indexOf(basePath) === 0) {
                        res.addNodeToCache(nodes[i], false); // no need to update lastUpdated since it is a whole new cache
                        nodes.splice(i, 1);
                        modified = true;
                    }
                }
                if (modified) {
                    _this.updateLastCacheModificationPerId(id);
                }
            });
            return res;
        };
        IdentifierCache.prototype.has = function (type, identifier) {
            var set = this.cache.get(identifier);
            if (!set)
                return false;
            return set.some(function (candidate) { return type.isAssignableFrom(candidate.type); });
        };
        IdentifierCache.prototype.resolve = function (type, identifier) {
            var set = this.cache.get(identifier);
            if (!set)
                return null;
            var matches = set.filter(function (candidate) { return type.isAssignableFrom(candidate.type); });
            switch (matches.length) {
                case 0:
                    return null;
                case 1:
                    return matches[0];
                default:
                    throw fail$1$1("Cannot resolve a reference to type '" + type.name + "' with id: '" + identifier + "' unambigously, there are multiple candidates: " + matches
                        .map(function (n) { return n.path; })
                        .join(", "));
            }
        };
        return IdentifierCache;
    }());

    /**
     * @internal
     * @hidden
     */
    function createObjectNode(type, parent, subpath, environment, initialValue) {
        var existingNode = getStateTreeNodeSafe(initialValue);
        if (existingNode) {
            if (existingNode.parent) {
                // istanbul ignore next
                throw fail$1$1("Cannot add an object to a state tree if it is already part of the same or another state tree. Tried to assign an object to '" + (parent ? parent.path : "") + "/" + subpath + "', but it lives already at '" + existingNode.path + "'");
            }
            if (parent) {
                existingNode.setParent(parent, subpath);
            }
            // else it already has no parent since it is a pre-requisite
            return existingNode;
        }
        // not a node, a snapshot
        return new ObjectNode(type, parent, subpath, environment, initialValue);
    }
    /**
     * @internal
     * @hidden
     */
    function createScalarNode(type, parent, subpath, environment, initialValue) {
        return new ScalarNode(type, parent, subpath, environment, initialValue);
    }
    /**
     * @internal
     * @hidden
     */
    function isNode(value) {
        return value instanceof ScalarNode || value instanceof ObjectNode;
    }

    /**
     * @internal
     * @hidden
     */
    var NodeLifeCycle;
    (function (NodeLifeCycle) {
        NodeLifeCycle[NodeLifeCycle["INITIALIZING"] = 0] = "INITIALIZING";
        NodeLifeCycle[NodeLifeCycle["CREATED"] = 1] = "CREATED";
        NodeLifeCycle[NodeLifeCycle["FINALIZED"] = 2] = "FINALIZED";
        NodeLifeCycle[NodeLifeCycle["DETACHING"] = 3] = "DETACHING";
        NodeLifeCycle[NodeLifeCycle["DEAD"] = 4] = "DEAD"; // no coming back from this one
    })(NodeLifeCycle || (NodeLifeCycle = {}));
    /**
     * Returns true if the given value is a node in a state tree.
     * More precisely, that is, if the value is an instance of a
     * `types.model`, `types.array` or `types.map`.
     *
     * @param value
     * @returns true if the value is a state tree node.
     */
    function isStateTreeNode(value) {
        return !!(value && value.$treenode);
    }
    /**
     * @internal
     * @hidden
     */
    function assertIsStateTreeNode(value, argNumber) {
        assertArg(value, isStateTreeNode, "mobx-state-tree node", argNumber);
    }
    /**
     * @internal
     * @hidden
     */
    function getStateTreeNode(value) {
        if (!isStateTreeNode(value)) {
            // istanbul ignore next
            throw fail$1$1("Value " + value + " is no MST Node");
        }
        return value.$treenode;
    }
    /**
     * @internal
     * @hidden
     */
    function getStateTreeNodeSafe(value) {
        return (value && value.$treenode) || null;
    }
    /**
     * @internal
     * @hidden
     */
    function toJSON() {
        return getStateTreeNode(this).snapshot;
    }
    /**
     * @internal
     * @hidden
     */
    function resolveNodeByPathParts(base, pathParts, failIfResolveFails) {
        if (failIfResolveFails === void 0) { failIfResolveFails = true; }
        var current = base;
        for (var i = 0; i < pathParts.length; i++) {
            var part = pathParts[i];
            if (part === "..") {
                current = current.parent;
                if (current)
                    continue; // not everything has a parent
            }
            else if (part === ".") {
                continue;
            }
            else if (current) {
                if (current instanceof ScalarNode) {
                    // check if the value of a scalar resolves to a state tree node (e.g. references)
                    // then we can continue resolving...
                    try {
                        var value = current.value;
                        if (isStateTreeNode(value)) {
                            current = getStateTreeNode(value);
                            // fall through
                        }
                    }
                    catch (e) {
                        if (!failIfResolveFails) {
                            return undefined;
                        }
                        throw e;
                    }
                }
                if (current instanceof ObjectNode) {
                    var subType = current.getChildType(part);
                    if (subType) {
                        current = current.getChildNode(part);
                        if (current)
                            continue;
                    }
                }
            }
            if (failIfResolveFails)
                throw fail$1$1("Could not resolve '" + part + "' in path '" + (joinJsonPath(pathParts.slice(0, i)) ||
                    "/") + "' while resolving '" + joinJsonPath(pathParts) + "'");
            else
                return undefined;
        }
        return current;
    }
    /**
     * @internal
     * @hidden
     */
    function convertChildNodesToArray(childNodes) {
        if (!childNodes)
            return EMPTY_ARRAY$1;
        var keys = Object.keys(childNodes);
        if (!keys.length)
            return EMPTY_ARRAY$1;
        var result = new Array(keys.length);
        keys.forEach(function (key, index) {
            result[index] = childNodes[key];
        });
        return result;
    }

    /**
     * @internal
     * @hidden
     */
    var EMPTY_ARRAY$1 = Object.freeze([]);
    /**
     * @internal
     * @hidden
     */
    var EMPTY_OBJECT$1 = Object.freeze({});
    /**
     * @internal
     * @hidden
     */
    var mobxShallow = typeof $mobx === "string" ? { deep: false } : { deep: false, proxy: false };
    Object.freeze(mobxShallow);
    /**
     * @internal
     * @hidden
     */
    function fail$1$1(message) {
        if (message === void 0) { message = "Illegal state"; }
        return new Error("[mobx-state-tree] " + message);
    }
    /**
     * @internal
     * @hidden
     */
    function identity(_) {
        return _;
    }
    /**
     * pollyfill (for IE) suggested in MDN:
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger
     * @internal
     * @hidden
     */
    var isInteger = Number.isInteger ||
        function (value) {
            return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
        };
    /**
     * @internal
     * @hidden
     */
    function isArray(val) {
        return Array.isArray(val) || isObservableArray(val);
    }
    /**
     * @internal
     * @hidden
     */
    function asArray(val) {
        if (!val)
            return EMPTY_ARRAY$1;
        if (isArray(val))
            return val;
        return [val];
    }
    /**
     * @internal
     * @hidden
     */
    function extend(a) {
        var b = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            b[_i - 1] = arguments[_i];
        }
        for (var i = 0; i < b.length; i++) {
            var current = b[i];
            for (var key in current)
                a[key] = current[key];
        }
        return a;
    }
    /**
     * @internal
     * @hidden
     */
    function isPlainObject$1(value) {
        if (value === null || typeof value !== "object")
            return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }
    /**
     * @internal
     * @hidden
     */
    function isMutable(value) {
        return (value !== null &&
            typeof value === "object" &&
            !(value instanceof Date) &&
            !(value instanceof RegExp));
    }
    /**
     * @internal
     * @hidden
     */
    function isPrimitive$1(value, includeDate) {
        if (includeDate === void 0) { includeDate = true; }
        if (value === null || value === undefined)
            return true;
        if (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            (includeDate && value instanceof Date))
            return true;
        return false;
    }
    /**
     * @internal
     * @hidden
     * Freeze a value and return it (if not in production)
     */
    function freeze(value) {
        if (!devMode())
            return value;
        return isPrimitive$1(value) || isObservableArray(value) ? value : Object.freeze(value);
    }
    /**
     * @internal
     * @hidden
     * Recursively freeze a value (if not in production)
     */
    function deepFreeze(value) {
        if (!devMode())
            return value;
        freeze(value);
        if (isPlainObject$1(value)) {
            Object.keys(value).forEach(function (propKey) {
                if (!isPrimitive$1(value[propKey]) &&
                    !Object.isFrozen(value[propKey])) {
                    deepFreeze(value[propKey]);
                }
            });
        }
        return value;
    }
    /**
     * @internal
     * @hidden
     */
    function isSerializable(value) {
        return typeof value !== "function";
    }
    /**
     * @internal
     * @hidden
     */
    function addHiddenFinalProp$1(object, propName, value) {
        Object.defineProperty(object, propName, {
            enumerable: false,
            writable: false,
            configurable: true,
            value: value
        });
    }
    /**
     * @internal
     * @hidden
     */
    function addHiddenWritableProp(object, propName, value) {
        Object.defineProperty(object, propName, {
            enumerable: false,
            writable: true,
            configurable: true,
            value: value
        });
    }
    /**
     * @internal
     * @hidden
     */
    var EventHandler = /** @class */ (function () {
        function EventHandler() {
            this.handlers = [];
        }
        Object.defineProperty(EventHandler.prototype, "hasSubscribers", {
            get: function () {
                return this.handlers.length > 0;
            },
            enumerable: true,
            configurable: true
        });
        EventHandler.prototype.register = function (fn, atTheBeginning) {
            var _this = this;
            if (atTheBeginning === void 0) { atTheBeginning = false; }
            if (atTheBeginning) {
                this.handlers.unshift(fn);
            }
            else {
                this.handlers.push(fn);
            }
            return function () {
                _this.unregister(fn);
            };
        };
        EventHandler.prototype.has = function (fn) {
            return this.handlers.indexOf(fn) >= 0;
        };
        EventHandler.prototype.unregister = function (fn) {
            var index = this.handlers.indexOf(fn);
            if (index >= 0) {
                this.handlers.splice(index, 1);
            }
        };
        EventHandler.prototype.clear = function () {
            this.handlers.length = 0;
        };
        EventHandler.prototype.emit = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            // make a copy just in case it changes
            var handlers = this.handlers.slice();
            handlers.forEach(function (f) { return f.apply(void 0, __spread$1(args)); });
        };
        return EventHandler;
    }());
    /**
     * @internal
     * @hidden
     */
    var EventHandlers = /** @class */ (function () {
        function EventHandlers() {
        }
        EventHandlers.prototype.hasSubscribers = function (event) {
            var handler = this.eventHandlers && this.eventHandlers[event];
            return !!handler && handler.hasSubscribers;
        };
        EventHandlers.prototype.register = function (event, fn, atTheBeginning) {
            if (atTheBeginning === void 0) { atTheBeginning = false; }
            if (!this.eventHandlers) {
                this.eventHandlers = {};
            }
            var handler = this.eventHandlers[event];
            if (!handler) {
                handler = this.eventHandlers[event] = new EventHandler();
            }
            return handler.register(fn, atTheBeginning);
        };
        EventHandlers.prototype.has = function (event, fn) {
            var handler = this.eventHandlers && this.eventHandlers[event];
            return !!handler && handler.has(fn);
        };
        EventHandlers.prototype.unregister = function (event, fn) {
            var handler = this.eventHandlers && this.eventHandlers[event];
            if (handler) {
                handler.unregister(fn);
            }
        };
        EventHandlers.prototype.clear = function (event) {
            if (this.eventHandlers) {
                delete this.eventHandlers[event];
            }
        };
        EventHandlers.prototype.clearAll = function () {
            this.eventHandlers = undefined;
        };
        EventHandlers.prototype.emit = function (event) {
            var _a;
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var handler = this.eventHandlers && this.eventHandlers[event];
            if (handler) {
                (_a = handler).emit.apply(_a, __spread$1(args));
            }
        };
        return EventHandlers;
    }());
    /**
     * @internal
     * @hidden
     */
    function argsToArray(args) {
        var res = new Array(args.length);
        for (var i = 0; i < args.length; i++)
            res[i] = args[i];
        return res;
    }
    /**
     * @internal
     * @hidden
     */
    function invalidateComputed(target, propName) {
        var atom = getAtom(target, propName);
        atom.trackAndCompute();
    }
    /**
     * @internal
     * @hidden
     */
    function stringStartsWith(str, beginning) {
        return str.indexOf(beginning) === 0;
    }
    /**
     * @internal
     * @hidden
     */
    function warnError(msg) {
        console.warn(new Error("[mobx-state-tree] " + msg));
    }
    /**
     * @internal
     * @hidden
     */
    function isTypeCheckingEnabled() {
        return (devMode() ||
            (typeof process !== "undefined" && process.env && process.env.ENABLE_TYPE_CHECK === "true"));
    }
    /**
     * @internal
     * @hidden
     */
    function devMode() {
        return process.env.NODE_ENV !== "production";
    }
    /**
     * @internal
     * @hidden
     */
    function assertArg(value, fn, typeName, argNumber) {
        if (devMode()) {
            if (!fn(value)) {
                // istanbul ignore next
                throw fail$1$1("expected " + typeName + " as argument " + asArray(argNumber).join(" or ") + ", got " + value + " instead");
            }
        }
    }
    /**
     * @internal
     * @hidden
     */
    function assertIsFunction(value, argNumber) {
        assertArg(value, function (fn) { return typeof fn === "function"; }, "function", argNumber);
    }
    /**
     * @internal
     * @hidden
     */
    function assertIsString(value, argNumber, canBeEmpty) {
        if (canBeEmpty === void 0) { canBeEmpty = true; }
        assertArg(value, function (s) { return typeof s === "string"; }, "string", argNumber);
        if (!canBeEmpty) {
            assertArg(value, function (s) { return s !== ""; }, "not empty string", argNumber);
        }
    }

    /**
     * @internal
     * @hidden
     */
    function splitPatch(patch) {
        if (!("oldValue" in patch))
            throw fail$1$1("Patches without `oldValue` field cannot be inversed");
        return [stripPatch(patch), invertPatch(patch)];
    }
    /**
     * @internal
     * @hidden
     */
    function stripPatch(patch) {
        // strips `oldvalue` information from the patch, so that it becomes a patch conform the json-patch spec
        // this removes the ability to undo the patch
        switch (patch.op) {
            case "add":
                return { op: "add", path: patch.path, value: patch.value };
            case "remove":
                return { op: "remove", path: patch.path };
            case "replace":
                return { op: "replace", path: patch.path, value: patch.value };
        }
    }
    function invertPatch(patch) {
        switch (patch.op) {
            case "add":
                return {
                    op: "remove",
                    path: patch.path
                };
            case "remove":
                return {
                    op: "add",
                    path: patch.path,
                    value: patch.oldValue
                };
            case "replace":
                return {
                    op: "replace",
                    path: patch.path,
                    value: patch.oldValue
                };
        }
    }
    /**
     * Simple simple check to check it is a number.
     */
    function isNumber(x) {
        return typeof x === "number";
    }
    /**
     * Escape slashes and backslashes.
     *
     * http://tools.ietf.org/html/rfc6901
     */
    function escapeJsonPath(path) {
        if (isNumber(path) === true) {
            return "" + path;
        }
        if (path.indexOf("/") === -1 && path.indexOf("~") === -1)
            return path;
        return path.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    /**
     * Unescape slashes and backslashes.
     */
    function unescapeJsonPath(path) {
        return path.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    /**
     * Generates a json-path compliant json path from path parts.
     *
     * @param path
     * @returns
     */
    function joinJsonPath(path) {
        // `/` refers to property with an empty name, while `` refers to root itself!
        if (path.length === 0)
            return "";
        var getPathStr = function (p) { return p.map(escapeJsonPath).join("/"); };
        if (path[0] === "." || path[0] === "..") {
            // relative
            return getPathStr(path);
        }
        else {
            // absolute
            return "/" + getPathStr(path);
        }
    }
    /**
     * Splits and decodes a json path into several parts.
     *
     * @param path
     * @returns
     */
    function splitJsonPath(path) {
        // `/` refers to property with an empty name, while `` refers to root itself!
        var parts = path.split("/").map(unescapeJsonPath);
        var valid = path === "" ||
            path === "." ||
            path === ".." ||
            stringStartsWith(path, "/") ||
            stringStartsWith(path, "./") ||
            stringStartsWith(path, "../");
        if (!valid) {
            throw fail$1$1("a json path must be either rooted, empty or relative, but got '" + path + "'");
        }
        // '/a/b/c' -> ["a", "b", "c"]
        // '../../b/c' -> ["..", "..", "b", "c"]
        // '' -> []
        // '/' -> ['']
        // './a' -> [".", "a"]
        // /./a' -> [".", "a"] equivalent to './a'
        if (parts[0] === "") {
            parts.shift();
        }
        return parts;
    }

    var SnapshotProcessor = /** @class */ (function (_super) {
        __extends$1(SnapshotProcessor, _super);
        function SnapshotProcessor(_subtype, _processors, name) {
            var _this = _super.call(this, name || _subtype.name) || this;
            _this._subtype = _subtype;
            _this._processors = _processors;
            return _this;
        }
        Object.defineProperty(SnapshotProcessor.prototype, "flags", {
            get: function () {
                return this._subtype.flags | TypeFlags.SnapshotProcessor;
            },
            enumerable: true,
            configurable: true
        });
        SnapshotProcessor.prototype.describe = function () {
            return "snapshotProcessor(" + this._subtype.describe() + ")";
        };
        SnapshotProcessor.prototype.preProcessSnapshot = function (sn) {
            if (this._processors.preProcessor) {
                return this._processors.preProcessor.call(null, sn);
            }
            return sn;
        };
        SnapshotProcessor.prototype.postProcessSnapshot = function (sn) {
            if (this._processors.postProcessor) {
                return this._processors.postProcessor.call(null, sn);
            }
            return sn;
        };
        SnapshotProcessor.prototype._fixNode = function (node) {
            var _this = this;
            // the node has to use these methods rather than the original type ones
            proxyNodeTypeMethods(node.type, this, "isAssignableFrom", "create");
            var oldGetSnapshot = node.getSnapshot;
            node.getSnapshot = function () {
                return _this.postProcessSnapshot(oldGetSnapshot.call(node));
            };
        };
        SnapshotProcessor.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            var processedInitialValue = isStateTreeNode(initialValue)
                ? initialValue
                : this.preProcessSnapshot(initialValue);
            var node = this._subtype.instantiate(parent, subpath, environment, processedInitialValue);
            this._fixNode(node);
            return node;
        };
        SnapshotProcessor.prototype.reconcile = function (current, newValue, parent, subpath) {
            var node = this._subtype.reconcile(current, isStateTreeNode(newValue) ? newValue : this.preProcessSnapshot(newValue), parent, subpath);
            if (node !== current) {
                this._fixNode(node);
            }
            return node;
        };
        SnapshotProcessor.prototype.getSnapshot = function (node, applyPostProcess) {
            if (applyPostProcess === void 0) { applyPostProcess = true; }
            var sn = this._subtype.getSnapshot(node);
            return applyPostProcess ? this.postProcessSnapshot(sn) : sn;
        };
        SnapshotProcessor.prototype.isValidSnapshot = function (value, context) {
            var processedSn = this.preProcessSnapshot(value);
            return this._subtype.validate(processedSn, context);
        };
        SnapshotProcessor.prototype.getSubTypes = function () {
            return this._subtype;
        };
        SnapshotProcessor.prototype.is = function (thing) {
            var value = isType(thing)
                ? this._subtype
                : isStateTreeNode(thing)
                    ? getSnapshot(thing, false)
                    : this.preProcessSnapshot(thing);
            return this._subtype.validate(value, [{ path: "", type: this._subtype }]).length === 0;
        };
        return SnapshotProcessor;
    }(BaseType));
    function proxyNodeTypeMethods(nodeType, snapshotProcessorType) {
        var e_1, _a;
        var methods = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            methods[_i - 2] = arguments[_i];
        }
        try {
            for (var methods_1 = __values$1(methods), methods_1_1 = methods_1.next(); !methods_1_1.done; methods_1_1 = methods_1.next()) {
                var method = methods_1_1.value;
                nodeType[method] = snapshotProcessorType[method].bind(snapshotProcessorType);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (methods_1_1 && !methods_1_1.done && (_a = methods_1.return)) _a.call(methods_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
    }
    /**
     * `types.snapshotProcessor` - Runs a pre/post snapshot processor before/after serializing a given type.
     *
     * Example:
     * ```ts
     * const Todo1 = types.model({ text: types.string })
     * // in the backend the text type must be null when empty
     * interface BackendTodo {
     *     text: string | null
     * }
     * const Todo2 = types.snapshotProcessor(Todo1, {
     *     // from snapshot to instance
     *     preProcessor(sn: BackendTodo) {
     *         return {
     *             text: sn.text || "";
     *         }
     *     },
     *     // from instance to snapshot
     *     postProcessor(sn): BackendTodo {
     *         return {
     *             text: !sn.text ? null : sn.text
     *         }
     *     }
     * })
     * ```
     *
     * @param type Type to run the processors over.
     * @param processors Processors to run.
     * @param name Type name, or undefined to inherit the inner type one.
     * @returns
     */
    function snapshotProcessor(type, processors, name) {
        assertIsType(type, 1);
        if (devMode()) {
            if (processors.postProcessor && typeof processors.postProcessor !== "function") {
                // istanbul ignore next
                throw fail("postSnapshotProcessor must be a function");
            }
            if (processors.preProcessor && typeof processors.preProcessor !== "function") {
                // istanbul ignore next
                throw fail("preSnapshotProcessor must be a function");
            }
        }
        return new SnapshotProcessor(type, processors, name);
    }

    var needsIdentifierError = "Map.put can only be used to store complex values that have an identifier type attribute";
    function tryCollectModelTypes(type, modelTypes) {
        var e_1, _a;
        var subtypes = type.getSubTypes();
        if (subtypes === cannotDetermineSubtype) {
            return false;
        }
        if (subtypes) {
            var subtypesArray = asArray(subtypes);
            try {
                for (var subtypesArray_1 = __values$1(subtypesArray), subtypesArray_1_1 = subtypesArray_1.next(); !subtypesArray_1_1.done; subtypesArray_1_1 = subtypesArray_1.next()) {
                    var subtype = subtypesArray_1_1.value;
                    if (!tryCollectModelTypes(subtype, modelTypes))
                        return false;
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (subtypesArray_1_1 && !subtypesArray_1_1.done && (_a = subtypesArray_1.return)) _a.call(subtypesArray_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        if (type instanceof ModelType) {
            modelTypes.push(type);
        }
        return true;
    }
    /**
     * @internal
     * @hidden
     */
    var MapIdentifierMode;
    (function (MapIdentifierMode) {
        MapIdentifierMode[MapIdentifierMode["UNKNOWN"] = 0] = "UNKNOWN";
        MapIdentifierMode[MapIdentifierMode["YES"] = 1] = "YES";
        MapIdentifierMode[MapIdentifierMode["NO"] = 2] = "NO";
    })(MapIdentifierMode || (MapIdentifierMode = {}));
    var MSTMap = /** @class */ (function (_super) {
        __extends$1(MSTMap, _super);
        function MSTMap(initialData) {
            return _super.call(this, initialData, observable.ref.enhancer) || this;
        }
        MSTMap.prototype.get = function (key) {
            // maybe this is over-enthousiastic? normalize numeric keys to strings
            return _super.prototype.get.call(this, "" + key);
        };
        MSTMap.prototype.has = function (key) {
            return _super.prototype.has.call(this, "" + key);
        };
        MSTMap.prototype.delete = function (key) {
            return _super.prototype.delete.call(this, "" + key);
        };
        MSTMap.prototype.set = function (key, value) {
            return _super.prototype.set.call(this, "" + key, value);
        };
        MSTMap.prototype.put = function (value) {
            if (!value)
                throw fail$1$1("Map.put cannot be used to set empty values");
            if (isStateTreeNode(value)) {
                var node = getStateTreeNode(value);
                if (devMode()) {
                    if (!node.identifierAttribute) {
                        throw fail$1$1(needsIdentifierError);
                    }
                }
                if (node.identifier === null) {
                    throw fail$1$1(needsIdentifierError);
                }
                this.set(node.identifier, value);
                return value;
            }
            else if (!isMutable(value)) {
                throw fail$1$1("Map.put can only be used to store complex values");
            }
            else {
                var mapNode = getStateTreeNode(this);
                var mapType = mapNode.type;
                if (mapType.identifierMode !== MapIdentifierMode.YES) {
                    throw fail$1$1(needsIdentifierError);
                }
                var idAttr = mapType.mapIdentifierAttribute;
                var id = value[idAttr];
                if (!isValidIdentifier(id)) {
                    // try again but this time after creating a node for the value
                    // since it might be an optional identifier
                    var newNode = this.put(mapType.getChildType().create(value, mapNode.environment));
                    return this.put(getSnapshot(newNode));
                }
                var key = normalizeIdentifier(id);
                this.set(key, value);
                return this.get(key);
            }
        };
        return MSTMap;
    }(ObservableMap));
    /**
     * @internal
     * @hidden
     */
    var MapType = /** @class */ (function (_super) {
        __extends$1(MapType, _super);
        function MapType(name, _subType, hookInitializers) {
            if (hookInitializers === void 0) { hookInitializers = []; }
            var _this = _super.call(this, name) || this;
            _this._subType = _subType;
            _this.identifierMode = MapIdentifierMode.UNKNOWN;
            _this.mapIdentifierAttribute = undefined;
            _this.flags = TypeFlags.Map;
            _this.hookInitializers = [];
            _this._determineIdentifierMode();
            _this.hookInitializers = hookInitializers;
            return _this;
        }
        MapType.prototype.hooks = function (hooks) {
            var hookInitializers = this.hookInitializers.length > 0 ? this.hookInitializers.concat(hooks) : [hooks];
            return new MapType(this.name, this._subType, hookInitializers);
        };
        MapType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            this._determineIdentifierMode();
            return createObjectNode(this, parent, subpath, environment, initialValue);
        };
        MapType.prototype._determineIdentifierMode = function () {
            if (this.identifierMode !== MapIdentifierMode.UNKNOWN) {
                return;
            }
            var modelTypes = [];
            if (tryCollectModelTypes(this._subType, modelTypes)) {
                var identifierAttribute_1 = undefined;
                modelTypes.forEach(function (type) {
                    if (type.identifierAttribute) {
                        if (identifierAttribute_1 && identifierAttribute_1 !== type.identifierAttribute) {
                            throw fail$1$1("The objects in a map should all have the same identifier attribute, expected '" + identifierAttribute_1 + "', but child of type '" + type.name + "' declared attribute '" + type.identifierAttribute + "' as identifier");
                        }
                        identifierAttribute_1 = type.identifierAttribute;
                    }
                });
                if (identifierAttribute_1) {
                    this.identifierMode = MapIdentifierMode.YES;
                    this.mapIdentifierAttribute = identifierAttribute_1;
                }
                else {
                    this.identifierMode = MapIdentifierMode.NO;
                }
            }
        };
        MapType.prototype.initializeChildNodes = function (objNode, initialSnapshot) {
            if (initialSnapshot === void 0) { initialSnapshot = {}; }
            var subType = objNode.type._subType;
            var result = {};
            Object.keys(initialSnapshot).forEach(function (name) {
                result[name] = subType.instantiate(objNode, name, undefined, initialSnapshot[name]);
            });
            return result;
        };
        MapType.prototype.createNewInstance = function (childNodes) {
            return new MSTMap(childNodes);
        };
        MapType.prototype.finalizeNewInstance = function (node, instance) {
            interceptReads(instance, node.unbox);
            var type = node.type;
            type.hookInitializers.forEach(function (initializer) {
                var hooks = initializer(instance);
                Object.keys(hooks).forEach(function (name) {
                    var hook = hooks[name];
                    var actionInvoker = createActionInvoker(instance, name, hook);
                    (!devMode() ? addHiddenFinalProp$1 : addHiddenWritableProp)(instance, name, actionInvoker);
                });
            });
            intercept(instance, this.willChange);
            observe(instance, this.didChange);
        };
        MapType.prototype.describe = function () {
            return "Map<string, " + this._subType.describe() + ">";
        };
        MapType.prototype.getChildren = function (node) {
            // return (node.storedValue as ObservableMap<any>).values()
            return values(node.storedValue);
        };
        MapType.prototype.getChildNode = function (node, key) {
            var childNode = node.storedValue.get("" + key);
            if (!childNode)
                throw fail$1$1("Not a child " + key);
            return childNode;
        };
        MapType.prototype.willChange = function (change) {
            var node = getStateTreeNode(change.object);
            var key = change.name;
            node.assertWritable({ subpath: key });
            var mapType = node.type;
            var subType = mapType._subType;
            switch (change.type) {
                case "update":
                    {
                        var newValue = change.newValue;
                        var oldValue = change.object.get(key);
                        if (newValue === oldValue)
                            return null;
                        typecheckInternal(subType, newValue);
                        change.newValue = subType.reconcile(node.getChildNode(key), change.newValue, node, key);
                        mapType.processIdentifier(key, change.newValue);
                    }
                    break;
                case "add":
                    {
                        typecheckInternal(subType, change.newValue);
                        change.newValue = subType.instantiate(node, key, undefined, change.newValue);
                        mapType.processIdentifier(key, change.newValue);
                    }
                    break;
            }
            return change;
        };
        MapType.prototype.processIdentifier = function (expected, node) {
            if (this.identifierMode === MapIdentifierMode.YES && node instanceof ObjectNode) {
                var identifier = node.identifier;
                if (identifier !== expected)
                    throw fail$1$1("A map of objects containing an identifier should always store the object under their own identifier. Trying to store key '" + identifier + "', but expected: '" + expected + "'");
            }
        };
        MapType.prototype.getSnapshot = function (node) {
            var res = {};
            node.getChildren().forEach(function (childNode) {
                res[childNode.subpath] = childNode.snapshot;
            });
            return res;
        };
        MapType.prototype.processInitialSnapshot = function (childNodes) {
            var processed = {};
            Object.keys(childNodes).forEach(function (key) {
                processed[key] = childNodes[key].getSnapshot();
            });
            return processed;
        };
        MapType.prototype.didChange = function (change) {
            var node = getStateTreeNode(change.object);
            switch (change.type) {
                case "update":
                    return void node.emitPatch({
                        op: "replace",
                        path: escapeJsonPath(change.name),
                        value: change.newValue.snapshot,
                        oldValue: change.oldValue ? change.oldValue.snapshot : undefined
                    }, node);
                case "add":
                    return void node.emitPatch({
                        op: "add",
                        path: escapeJsonPath(change.name),
                        value: change.newValue.snapshot,
                        oldValue: undefined
                    }, node);
                case "delete":
                    // a node got deleted, get the old snapshot and make the node die
                    var oldSnapshot = change.oldValue.snapshot;
                    change.oldValue.die();
                    // emit the patch
                    return void node.emitPatch({
                        op: "remove",
                        path: escapeJsonPath(change.name),
                        oldValue: oldSnapshot
                    }, node);
            }
        };
        MapType.prototype.applyPatchLocally = function (node, subpath, patch) {
            var target = node.storedValue;
            switch (patch.op) {
                case "add":
                case "replace":
                    target.set(subpath, patch.value);
                    break;
                case "remove":
                    target.delete(subpath);
                    break;
            }
        };
        MapType.prototype.applySnapshot = function (node, snapshot) {
            typecheckInternal(this, snapshot);
            var target = node.storedValue;
            var currentKeys = {};
            Array.from(target.keys()).forEach(function (key) {
                currentKeys[key] = false;
            });
            if (snapshot) {
                // Don't use target.replace, as it will throw away all existing items first
                for (var key in snapshot) {
                    target.set(key, snapshot[key]);
                    currentKeys["" + key] = true;
                }
            }
            Object.keys(currentKeys).forEach(function (key) {
                if (currentKeys[key] === false)
                    target.delete(key);
            });
        };
        MapType.prototype.getChildType = function () {
            return this._subType;
        };
        MapType.prototype.isValidSnapshot = function (value, context) {
            var _this = this;
            if (!isPlainObject$1(value)) {
                return typeCheckFailure(context, value, "Value is not a plain object");
            }
            return flattenTypeErrors(Object.keys(value).map(function (path) {
                return _this._subType.validate(value[path], getContextForPath(context, path, _this._subType));
            }));
        };
        MapType.prototype.getDefaultSnapshot = function () {
            return EMPTY_OBJECT$1;
        };
        MapType.prototype.removeChild = function (node, subpath) {
            node.storedValue.delete(subpath);
        };
        __decorate([
            action
        ], MapType.prototype, "applySnapshot", null);
        return MapType;
    }(ComplexType));
    /**
     * `types.map` - Creates a key based collection type who's children are all of a uniform declared type.
     * If the type stored in a map has an identifier, it is mandatory to store the child under that identifier in the map.
     *
     * This type will always produce [observable maps](https://mobx.js.org/refguide/map.html)
     *
     * Example:
     * ```ts
     * const Todo = types.model({
     *   id: types.identifier,
     *   task: types.string
     * })
     *
     * const TodoStore = types.model({
     *   todos: types.map(Todo)
     * })
     *
     * const s = TodoStore.create({ todos: {} })
     * unprotect(s)
     * s.todos.set(17, { task: "Grab coffee", id: 17 })
     * s.todos.put({ task: "Grab cookie", id: 18 }) // put will infer key from the identifier
     * console.log(s.todos.get(17).task) // prints: "Grab coffee"
     * ```
     *
     * @param subtype
     * @returns
     */
    function map(subtype) {
        return new MapType("map<string, " + subtype.name + ">", subtype);
    }

    /**
     * @internal
     * @hidden
     */
    var ArrayType = /** @class */ (function (_super) {
        __extends$1(ArrayType, _super);
        function ArrayType(name, _subType, hookInitializers) {
            if (hookInitializers === void 0) { hookInitializers = []; }
            var _this = _super.call(this, name) || this;
            _this._subType = _subType;
            _this.flags = TypeFlags.Array;
            _this.hookInitializers = [];
            _this.hookInitializers = hookInitializers;
            return _this;
        }
        ArrayType.prototype.hooks = function (hooks) {
            var hookInitializers = this.hookInitializers.length > 0 ? this.hookInitializers.concat(hooks) : [hooks];
            return new ArrayType(this.name, this._subType, hookInitializers);
        };
        ArrayType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            return createObjectNode(this, parent, subpath, environment, initialValue);
        };
        ArrayType.prototype.initializeChildNodes = function (objNode, snapshot) {
            if (snapshot === void 0) { snapshot = []; }
            var subType = objNode.type._subType;
            var result = {};
            snapshot.forEach(function (item, index) {
                var subpath = "" + index;
                result[subpath] = subType.instantiate(objNode, subpath, undefined, item);
            });
            return result;
        };
        ArrayType.prototype.createNewInstance = function (childNodes) {
            return observable.array(convertChildNodesToArray(childNodes), mobxShallow);
        };
        ArrayType.prototype.finalizeNewInstance = function (node, instance) {
            getAdministration(instance).dehancer = node.unbox;
            var type = node.type;
            type.hookInitializers.forEach(function (initializer) {
                var hooks = initializer(instance);
                Object.keys(hooks).forEach(function (name) {
                    var hook = hooks[name];
                    var actionInvoker = createActionInvoker(instance, name, hook);
                    (!devMode() ? addHiddenFinalProp$1 : addHiddenWritableProp)(instance, name, actionInvoker);
                });
            });
            intercept(instance, this.willChange);
            observe(instance, this.didChange);
        };
        ArrayType.prototype.describe = function () {
            return this._subType.describe() + "[]";
        };
        ArrayType.prototype.getChildren = function (node) {
            return node.storedValue.slice();
        };
        ArrayType.prototype.getChildNode = function (node, key) {
            var index = Number(key);
            if (index < node.storedValue.length)
                return node.storedValue[index];
            throw fail$1$1("Not a child: " + key);
        };
        ArrayType.prototype.willChange = function (change) {
            var node = getStateTreeNode(change.object);
            node.assertWritable({ subpath: "" + change.index });
            var subType = node.type._subType;
            var childNodes = node.getChildren();
            switch (change.type) {
                case "update":
                    {
                        if (change.newValue === change.object[change.index])
                            return null;
                        var updatedNodes = reconcileArrayChildren(node, subType, [childNodes[change.index]], [change.newValue], [change.index]);
                        if (!updatedNodes) {
                            return null;
                        }
                        change.newValue = updatedNodes[0];
                    }
                    break;
                case "splice":
                    {
                        var index_1 = change.index, removedCount = change.removedCount, added = change.added;
                        var addedNodes = reconcileArrayChildren(node, subType, childNodes.slice(index_1, index_1 + removedCount), added, added.map(function (_, i) { return index_1 + i; }));
                        if (!addedNodes) {
                            return null;
                        }
                        change.added = addedNodes;
                        // update paths of remaining items
                        for (var i = index_1 + removedCount; i < childNodes.length; i++) {
                            childNodes[i].setParent(node, "" + (i + added.length - removedCount));
                        }
                    }
                    break;
            }
            return change;
        };
        ArrayType.prototype.getSnapshot = function (node) {
            return node.getChildren().map(function (childNode) { return childNode.snapshot; });
        };
        ArrayType.prototype.processInitialSnapshot = function (childNodes) {
            var processed = [];
            Object.keys(childNodes).forEach(function (key) {
                processed.push(childNodes[key].getSnapshot());
            });
            return processed;
        };
        ArrayType.prototype.didChange = function (change) {
            var node = getStateTreeNode(change.object);
            switch (change.type) {
                case "update":
                    return void node.emitPatch({
                        op: "replace",
                        path: "" + change.index,
                        value: change.newValue.snapshot,
                        oldValue: change.oldValue ? change.oldValue.snapshot : undefined
                    }, node);
                case "splice":
                    for (var i = change.removedCount - 1; i >= 0; i--)
                        node.emitPatch({
                            op: "remove",
                            path: "" + (change.index + i),
                            oldValue: change.removed[i].snapshot
                        }, node);
                    for (var i = 0; i < change.addedCount; i++)
                        node.emitPatch({
                            op: "add",
                            path: "" + (change.index + i),
                            value: node.getChildNode("" + (change.index + i)).snapshot,
                            oldValue: undefined
                        }, node);
                    return;
            }
        };
        ArrayType.prototype.applyPatchLocally = function (node, subpath, patch) {
            var target = node.storedValue;
            var index = subpath === "-" ? target.length : Number(subpath);
            switch (patch.op) {
                case "replace":
                    target[index] = patch.value;
                    break;
                case "add":
                    target.splice(index, 0, patch.value);
                    break;
                case "remove":
                    target.splice(index, 1);
                    break;
            }
        };
        ArrayType.prototype.applySnapshot = function (node, snapshot) {
            typecheckInternal(this, snapshot);
            var target = node.storedValue;
            target.replace(snapshot);
        };
        ArrayType.prototype.getChildType = function () {
            return this._subType;
        };
        ArrayType.prototype.isValidSnapshot = function (value, context) {
            var _this = this;
            if (!isArray(value)) {
                return typeCheckFailure(context, value, "Value is not an array");
            }
            return flattenTypeErrors(value.map(function (item, index) {
                return _this._subType.validate(item, getContextForPath(context, "" + index, _this._subType));
            }));
        };
        ArrayType.prototype.getDefaultSnapshot = function () {
            return EMPTY_ARRAY$1;
        };
        ArrayType.prototype.removeChild = function (node, subpath) {
            node.storedValue.splice(Number(subpath), 1);
        };
        __decorate([
            action
        ], ArrayType.prototype, "applySnapshot", null);
        return ArrayType;
    }(ComplexType));
    /**
     * `types.array` - Creates an index based collection type who's children are all of a uniform declared type.
     *
     * This type will always produce [observable arrays](https://mobx.js.org/refguide/array.html)
     *
     * Example:
     * ```ts
     * const Todo = types.model({
     *   task: types.string
     * })
     *
     * const TodoStore = types.model({
     *   todos: types.array(Todo)
     * })
     *
     * const s = TodoStore.create({ todos: [] })
     * unprotect(s) // needed to allow modifying outside of an action
     * s.todos.push({ task: "Grab coffee" })
     * console.log(s.todos[0]) // prints: "Grab coffee"
     * ```
     *
     * @param subtype
     * @returns
     */
    function array(subtype) {
        assertIsType(subtype, 1);
        return new ArrayType(subtype.name + "[]", subtype);
    }
    function reconcileArrayChildren(parent, childType, oldNodes, newValues, newPaths) {
        var nothingChanged = true;
        for (var i = 0;; i++) {
            var hasNewNode = i <= newValues.length - 1;
            var oldNode = oldNodes[i];
            var newValue = hasNewNode ? newValues[i] : undefined;
            var newPath = "" + newPaths[i];
            // for some reason, instead of newValue we got a node, fallback to the storedValue
            // TODO: https://github.com/mobxjs/mobx-state-tree/issues/340#issuecomment-325581681
            if (isNode(newValue))
                newValue = newValue.storedValue;
            if (!oldNode && !hasNewNode) {
                // both are empty, end
                break;
            }
            else if (!hasNewNode) {
                // new one does not exists
                nothingChanged = false;
                oldNodes.splice(i, 1);
                if (oldNode instanceof ObjectNode) {
                    // since it is going to be returned by pop/splice/shift better create it before killing it
                    // so it doesn't end up in an undead state
                    oldNode.createObservableInstanceIfNeeded();
                }
                oldNode.die();
                i--;
            }
            else if (!oldNode) {
                // there is no old node, create it
                // check if already belongs to the same parent. if so, avoid pushing item in. only swapping can occur.
                if (isStateTreeNode(newValue) && getStateTreeNode(newValue).parent === parent) {
                    // this node is owned by this parent, but not in the reconcilable set, so it must be double
                    throw fail$1$1("Cannot add an object to a state tree if it is already part of the same or another state tree. Tried to assign an object to '" + parent.path + "/" + newPath + "', but it lives already at '" + getStateTreeNode(newValue).path + "'");
                }
                nothingChanged = false;
                var newNode = valueAsNode(childType, parent, newPath, newValue);
                oldNodes.splice(i, 0, newNode);
            }
            else if (areSame(oldNode, newValue)) {
                // both are the same, reconcile
                oldNodes[i] = valueAsNode(childType, parent, newPath, newValue, oldNode);
            }
            else {
                // nothing to do, try to reorder
                var oldMatch = undefined;
                // find a possible candidate to reuse
                for (var j = i; j < oldNodes.length; j++) {
                    if (areSame(oldNodes[j], newValue)) {
                        oldMatch = oldNodes.splice(j, 1)[0];
                        break;
                    }
                }
                nothingChanged = false;
                var newNode = valueAsNode(childType, parent, newPath, newValue, oldMatch);
                oldNodes.splice(i, 0, newNode);
            }
        }
        return nothingChanged ? null : oldNodes;
    }
    /**
     * Convert a value to a node at given parent and subpath. Attempts to reuse old node if possible and given.
     */
    function valueAsNode(childType, parent, subpath, newValue, oldNode) {
        // ensure the value is valid-ish
        typecheckInternal(childType, newValue);
        function getNewNode() {
            // the new value has a MST node
            if (isStateTreeNode(newValue)) {
                var childNode = getStateTreeNode(newValue);
                childNode.assertAlive(EMPTY_OBJECT$1);
                // the node lives here
                if (childNode.parent !== null && childNode.parent === parent) {
                    childNode.setParent(parent, subpath);
                    return childNode;
                }
            }
            // there is old node and new one is a value/snapshot
            if (oldNode) {
                return childType.reconcile(oldNode, newValue, parent, subpath);
            }
            // nothing to do, create from scratch
            return childType.instantiate(parent, subpath, undefined, newValue);
        }
        var newNode = getNewNode();
        if (oldNode && oldNode !== newNode) {
            if (oldNode instanceof ObjectNode) {
                // since it is going to be returned by pop/splice/shift better create it before killing it
                // so it doesn't end up in an undead state
                oldNode.createObservableInstanceIfNeeded();
            }
            oldNode.die();
        }
        return newNode;
    }
    /**
     * Check if a node holds a value.
     */
    function areSame(oldNode, newValue) {
        // never consider dead old nodes for reconciliation
        if (!oldNode.isAlive) {
            return false;
        }
        // the new value has the same node
        if (isStateTreeNode(newValue)) {
            var newNode = getStateTreeNode(newValue);
            return newNode.isAlive && newNode === oldNode;
        }
        // the provided value is the snapshot of the old node
        if (oldNode.snapshot === newValue) {
            return true;
        }
        // new value is a snapshot with the correct identifier
        return (oldNode instanceof ObjectNode &&
            oldNode.identifier !== null &&
            oldNode.identifierAttribute &&
            isPlainObject$1(newValue) &&
            oldNode.identifier === normalizeIdentifier(newValue[oldNode.identifierAttribute]) &&
            oldNode.type.is(newValue));
    }

    var PRE_PROCESS_SNAPSHOT = "preProcessSnapshot";
    var POST_PROCESS_SNAPSHOT = "postProcessSnapshot";
    function objectTypeToString() {
        return getStateTreeNode(this).toString();
    }
    var defaultObjectOptions = {
        name: "AnonymousModel",
        properties: {},
        initializers: EMPTY_ARRAY$1
    };
    function toPropertiesObject(declaredProps) {
        // loop through properties and ensures that all items are types
        return Object.keys(declaredProps).reduce(function (props, key) {
            var _a, _b, _c;
            // warn if user intended a HOOK
            if (key in Hook)
                throw fail$1$1("Hook '" + key + "' was defined as property. Hooks should be defined as part of the actions");
            // the user intended to use a view
            var descriptor = Object.getOwnPropertyDescriptor(props, key);
            if ("get" in descriptor) {
                throw fail$1$1("Getters are not supported as properties. Please use views instead");
            }
            // undefined and null are not valid
            var value = descriptor.value;
            if (value === null || value === undefined) {
                throw fail$1$1("The default value of an attribute cannot be null or undefined as the type cannot be inferred. Did you mean `types.maybe(someType)`?");
                // its a primitive, convert to its type
            }
            else if (isPrimitive$1(value)) {
                return Object.assign({}, props, (_a = {},
                    _a[key] = optional(getPrimitiveFactoryFromValue(value), value),
                    _a));
                // map defaults to empty object automatically for models
            }
            else if (value instanceof MapType) {
                return Object.assign({}, props, (_b = {},
                    _b[key] = optional(value, {}),
                    _b));
            }
            else if (value instanceof ArrayType) {
                return Object.assign({}, props, (_c = {}, _c[key] = optional(value, []), _c));
                // its already a type
            }
            else if (isType(value)) {
                return props;
                // its a function, maybe the user wanted a view?
            }
            else if (devMode() && typeof value === "function") {
                throw fail$1$1("Invalid type definition for property '" + key + "', it looks like you passed a function. Did you forget to invoke it, or did you intend to declare a view / action?");
                // no other complex values
            }
            else if (devMode() && typeof value === "object") {
                throw fail$1$1("Invalid type definition for property '" + key + "', it looks like you passed an object. Try passing another model type or a types.frozen.");
                // WTF did you pass in mate?
            }
            else {
                throw fail$1$1("Invalid type definition for property '" + key + "', cannot infer a type from a value like '" + value + "' (" + typeof value + ")");
            }
        }, declaredProps);
    }
    /**
     * @internal
     * @hidden
     */
    var ModelType = /** @class */ (function (_super) {
        __extends$1(ModelType, _super);
        function ModelType(opts) {
            var _this = _super.call(this, opts.name || defaultObjectOptions.name) || this;
            _this.flags = TypeFlags.Object;
            _this.named = function (name) {
                return _this.cloneAndEnhance({ name: name });
            };
            _this.props = function (properties) {
                return _this.cloneAndEnhance({ properties: properties });
            };
            _this.preProcessSnapshot = function (preProcessor) {
                var currentPreprocessor = _this.preProcessor;
                if (!currentPreprocessor)
                    return _this.cloneAndEnhance({ preProcessor: preProcessor });
                else
                    return _this.cloneAndEnhance({
                        preProcessor: function (snapshot) { return currentPreprocessor(preProcessor(snapshot)); }
                    });
            };
            _this.postProcessSnapshot = function (postProcessor) {
                var currentPostprocessor = _this.postProcessor;
                if (!currentPostprocessor)
                    return _this.cloneAndEnhance({ postProcessor: postProcessor });
                else
                    return _this.cloneAndEnhance({
                        postProcessor: function (snapshot) { return postProcessor(currentPostprocessor(snapshot)); }
                    });
            };
            Object.assign(_this, defaultObjectOptions, opts);
            // ensures that any default value gets converted to its related type
            _this.properties = toPropertiesObject(_this.properties);
            freeze(_this.properties); // make sure nobody messes with it
            _this.propertyNames = Object.keys(_this.properties);
            _this.identifierAttribute = _this._getIdentifierAttribute();
            return _this;
        }
        ModelType.prototype._getIdentifierAttribute = function () {
            var identifierAttribute = undefined;
            this.forAllProps(function (propName, propType) {
                if (propType.flags & TypeFlags.Identifier) {
                    if (identifierAttribute)
                        throw fail$1$1("Cannot define property '" + propName + "' as object identifier, property '" + identifierAttribute + "' is already defined as identifier property");
                    identifierAttribute = propName;
                }
            });
            return identifierAttribute;
        };
        ModelType.prototype.cloneAndEnhance = function (opts) {
            return new ModelType({
                name: opts.name || this.name,
                properties: Object.assign({}, this.properties, opts.properties),
                initializers: this.initializers.concat(opts.initializers || []),
                preProcessor: opts.preProcessor || this.preProcessor,
                postProcessor: opts.postProcessor || this.postProcessor
            });
        };
        ModelType.prototype.actions = function (fn) {
            var _this = this;
            var actionInitializer = function (self) {
                _this.instantiateActions(self, fn(self));
                return self;
            };
            return this.cloneAndEnhance({ initializers: [actionInitializer] });
        };
        ModelType.prototype.instantiateActions = function (self, actions) {
            // check if return is correct
            if (!isPlainObject$1(actions))
                throw fail$1$1("actions initializer should return a plain object containing actions");
            // bind actions to the object created
            Object.keys(actions).forEach(function (name) {
                // warn if preprocessor was given
                if (name === PRE_PROCESS_SNAPSHOT)
                    throw fail$1$1("Cannot define action '" + PRE_PROCESS_SNAPSHOT + "', it should be defined using 'type.preProcessSnapshot(fn)' instead");
                // warn if postprocessor was given
                if (name === POST_PROCESS_SNAPSHOT)
                    throw fail$1$1("Cannot define action '" + POST_PROCESS_SNAPSHOT + "', it should be defined using 'type.postProcessSnapshot(fn)' instead");
                var action2 = actions[name];
                // apply hook composition
                var baseAction = self[name];
                if (name in Hook && baseAction) {
                    var specializedAction_1 = action2;
                    action2 = function () {
                        baseAction.apply(null, arguments);
                        specializedAction_1.apply(null, arguments);
                    };
                }
                // the goal of this is to make sure actions using "this" can call themselves,
                // while still allowing the middlewares to register them
                var middlewares = action2.$mst_middleware; // make sure middlewares are not lost
                var boundAction = action2.bind(actions);
                boundAction.$mst_middleware = middlewares;
                var actionInvoker = createActionInvoker(self, name, boundAction);
                actions[name] = actionInvoker;
                (!devMode() ? addHiddenFinalProp$1 : addHiddenWritableProp)(self, name, actionInvoker);
            });
        };
        ModelType.prototype.volatile = function (fn) {
            var _this = this;
            var stateInitializer = function (self) {
                _this.instantiateVolatileState(self, fn(self));
                return self;
            };
            return this.cloneAndEnhance({ initializers: [stateInitializer] });
        };
        ModelType.prototype.instantiateVolatileState = function (self, state) {
            // check views return
            if (!isPlainObject$1(state))
                throw fail$1$1("volatile state initializer should return a plain object containing state");
            set(self, state);
        };
        ModelType.prototype.extend = function (fn) {
            var _this = this;
            var initializer = function (self) {
                var _a = fn(self), actions = _a.actions, views = _a.views, state = _a.state, rest = __rest(_a, ["actions", "views", "state"]);
                for (var key in rest)
                    throw fail$1$1("The `extend` function should return an object with a subset of the fields 'actions', 'views' and 'state'. Found invalid key '" + key + "'");
                if (state)
                    _this.instantiateVolatileState(self, state);
                if (views)
                    _this.instantiateViews(self, views);
                if (actions)
                    _this.instantiateActions(self, actions);
                return self;
            };
            return this.cloneAndEnhance({ initializers: [initializer] });
        };
        ModelType.prototype.views = function (fn) {
            var _this = this;
            var viewInitializer = function (self) {
                _this.instantiateViews(self, fn(self));
                return self;
            };
            return this.cloneAndEnhance({ initializers: [viewInitializer] });
        };
        ModelType.prototype.instantiateViews = function (self, views) {
            // check views return
            if (!isPlainObject$1(views))
                throw fail$1$1("views initializer should return a plain object containing views");
            Object.keys(views).forEach(function (key) {
                // is this a computed property?
                var descriptor = Object.getOwnPropertyDescriptor(views, key);
                if ("get" in descriptor) {
                    if (isComputedProp(self, key)) {
                        var computedValue = getAdministration(self, key);
                        // TODO: mobx currently does not allow redefining computes yet, pending #1121
                        // FIXME: this binds to the internals of mobx!
                        computedValue.derivation = descriptor.get;
                        computedValue.scope = self;
                        if (descriptor.set)
                            computedValue.setter = action(computedValue.name + "-setter", descriptor.set);
                    }
                    else {
                        computed(self, key, descriptor, true);
                    }
                }
                else if (typeof descriptor.value === "function") {
                    (!devMode() ? addHiddenFinalProp$1 : addHiddenWritableProp)(self, key, descriptor.value);
                }
                else {
                    throw fail$1$1("A view member should either be a function or getter based property");
                }
            });
        };
        ModelType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            var value = isStateTreeNode(initialValue)
                ? initialValue
                : this.applySnapshotPreProcessor(initialValue);
            return createObjectNode(this, parent, subpath, environment, value);
            // Optimization: record all prop- view- and action names after first construction, and generate an optimal base class
            // that pre-reserves all these fields for fast object-member lookups
        };
        ModelType.prototype.initializeChildNodes = function (objNode, initialSnapshot) {
            if (initialSnapshot === void 0) { initialSnapshot = {}; }
            var type = objNode.type;
            var result = {};
            type.forAllProps(function (name, childType) {
                result[name] = childType.instantiate(objNode, name, undefined, initialSnapshot[name]);
            });
            return result;
        };
        ModelType.prototype.createNewInstance = function (childNodes) {
            return observable.object(childNodes, EMPTY_OBJECT$1, mobxShallow);
        };
        ModelType.prototype.finalizeNewInstance = function (node, instance) {
            addHiddenFinalProp$1(instance, "toString", objectTypeToString);
            this.forAllProps(function (name) {
                interceptReads(instance, name, node.unbox);
            });
            this.initializers.reduce(function (self, fn) { return fn(self); }, instance);
            intercept(instance, this.willChange);
            observe(instance, this.didChange);
        };
        ModelType.prototype.willChange = function (chg) {
            // TODO: mobx typings don't seem to take into account that newValue can be set even when removing a prop
            var change = chg;
            var node = getStateTreeNode(change.object);
            var subpath = change.name;
            node.assertWritable({ subpath: subpath });
            var childType = node.type.properties[subpath];
            // only properties are typed, state are stored as-is references
            if (childType) {
                typecheckInternal(childType, change.newValue);
                change.newValue = childType.reconcile(node.getChildNode(subpath), change.newValue, node, subpath);
            }
            return change;
        };
        ModelType.prototype.didChange = function (chg) {
            // TODO: mobx typings don't seem to take into account that newValue can be set even when removing a prop
            var change = chg;
            var childNode = getStateTreeNode(change.object);
            var childType = childNode.type.properties[change.name];
            if (!childType) {
                // don't emit patches for volatile state
                return;
            }
            var oldChildValue = change.oldValue ? change.oldValue.snapshot : undefined;
            childNode.emitPatch({
                op: "replace",
                path: escapeJsonPath(change.name),
                value: change.newValue.snapshot,
                oldValue: oldChildValue
            }, childNode);
        };
        ModelType.prototype.getChildren = function (node) {
            var _this = this;
            var res = [];
            this.forAllProps(function (name) {
                res.push(_this.getChildNode(node, name));
            });
            return res;
        };
        ModelType.prototype.getChildNode = function (node, key) {
            if (!(key in this.properties))
                throw fail$1$1("Not a value property: " + key);
            var childNode = getAdministration(node.storedValue, key).value; // TODO: blegh!
            if (!childNode)
                throw fail$1$1("Node not available for property " + key);
            return childNode;
        };
        ModelType.prototype.getSnapshot = function (node, applyPostProcess) {
            var _this = this;
            if (applyPostProcess === void 0) { applyPostProcess = true; }
            var res = {};
            this.forAllProps(function (name, type) {
                getAtom(node.storedValue, name).reportObserved();
                res[name] = _this.getChildNode(node, name).snapshot;
            });
            if (applyPostProcess) {
                return this.applySnapshotPostProcessor(res);
            }
            return res;
        };
        ModelType.prototype.processInitialSnapshot = function (childNodes) {
            var processed = {};
            Object.keys(childNodes).forEach(function (key) {
                processed[key] = childNodes[key].getSnapshot();
            });
            return this.applySnapshotPostProcessor(processed);
        };
        ModelType.prototype.applyPatchLocally = function (node, subpath, patch) {
            if (!(patch.op === "replace" || patch.op === "add")) {
                throw fail$1$1("object does not support operation " + patch.op);
            }
            node.storedValue[subpath] = patch.value;
        };
        ModelType.prototype.applySnapshot = function (node, snapshot) {
            var preProcessedSnapshot = this.applySnapshotPreProcessor(snapshot);
            typecheckInternal(this, preProcessedSnapshot);
            this.forAllProps(function (name) {
                node.storedValue[name] = preProcessedSnapshot[name];
            });
        };
        ModelType.prototype.applySnapshotPreProcessor = function (snapshot) {
            var processor = this.preProcessor;
            return processor ? processor.call(null, snapshot) : snapshot;
        };
        ModelType.prototype.applySnapshotPostProcessor = function (snapshot) {
            var postProcessor = this.postProcessor;
            if (postProcessor)
                return postProcessor.call(null, snapshot);
            return snapshot;
        };
        ModelType.prototype.getChildType = function (propertyName) {
            assertIsString(propertyName, 1);
            return this.properties[propertyName];
        };
        ModelType.prototype.isValidSnapshot = function (value, context) {
            var _this = this;
            var snapshot = this.applySnapshotPreProcessor(value);
            if (!isPlainObject$1(snapshot)) {
                return typeCheckFailure(context, snapshot, "Value is not a plain object");
            }
            return flattenTypeErrors(this.propertyNames.map(function (key) {
                return _this.properties[key].validate(snapshot[key], getContextForPath(context, key, _this.properties[key]));
            }));
        };
        ModelType.prototype.forAllProps = function (fn) {
            var _this = this;
            this.propertyNames.forEach(function (key) { return fn(key, _this.properties[key]); });
        };
        ModelType.prototype.describe = function () {
            var _this = this;
            // optimization: cache
            return ("{ " +
                this.propertyNames.map(function (key) { return key + ": " + _this.properties[key].describe(); }).join("; ") +
                " }");
        };
        ModelType.prototype.getDefaultSnapshot = function () {
            return EMPTY_OBJECT$1;
        };
        ModelType.prototype.removeChild = function (node, subpath) {
            node.storedValue[subpath] = undefined;
        };
        __decorate([
            action
        ], ModelType.prototype, "applySnapshot", null);
        return ModelType;
    }(ComplexType));
    /**
     * `types.model` - Creates a new model type by providing a name, properties, volatile state and actions.
     *
     * See the [model type](/concepts/trees#creating-models) description or the [getting started](intro/getting-started.md#getting-started-1) tutorial.
     */
    function model() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var name = typeof args[0] === "string" ? args.shift() : "AnonymousModel";
        var properties = args.shift() || {};
        return new ModelType({ name: name, properties: properties });
    }
    /**
     * `types.compose` - Composes a new model from one or more existing model types.
     * This method can be invoked in two forms:
     * Given 2 or more model types, the types are composed into a new Type.
     * Given first parameter as a string and 2 or more model types,
     * the types are composed into a new Type with the given name
     */
    function compose() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        // TODO: just join the base type names if no name is provided
        var hasTypename = typeof args[0] === "string";
        var typeName = hasTypename ? args[0] : "AnonymousModel";
        if (hasTypename) {
            args.shift();
        }
        // check all parameters
        if (devMode()) {
            args.forEach(function (type, i) {
                assertArg(type, isModelType, "mobx-state-tree model type", hasTypename ? i + 2 : i + 1);
            });
        }
        return args
            .reduce(function (prev, cur) {
            return prev.cloneAndEnhance({
                name: prev.name + "_" + cur.name,
                properties: cur.properties,
                initializers: cur.initializers,
                preProcessor: function (snapshot) {
                    return cur.applySnapshotPreProcessor(prev.applySnapshotPreProcessor(snapshot));
                },
                postProcessor: function (snapshot) {
                    return cur.applySnapshotPostProcessor(prev.applySnapshotPostProcessor(snapshot));
                }
            });
        })
            .named(typeName);
    }
    /**
     * Returns if a given value represents a model type.
     *
     * @param type
     * @returns
     */
    function isModelType(type) {
        return isType(type) && (type.flags & TypeFlags.Object) > 0;
    }

    // TODO: implement CoreType using types.custom ?
    /**
     * @internal
     * @hidden
     */
    var CoreType = /** @class */ (function (_super) {
        __extends$1(CoreType, _super);
        function CoreType(name, flags, checker, initializer) {
            if (initializer === void 0) { initializer = identity; }
            var _this = _super.call(this, name) || this;
            _this.flags = flags;
            _this.checker = checker;
            _this.initializer = initializer;
            _this.flags = flags;
            return _this;
        }
        CoreType.prototype.describe = function () {
            return this.name;
        };
        CoreType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            return createScalarNode(this, parent, subpath, environment, initialValue);
        };
        CoreType.prototype.createNewInstance = function (snapshot) {
            return this.initializer(snapshot);
        };
        CoreType.prototype.isValidSnapshot = function (value, context) {
            if (isPrimitive$1(value) && this.checker(value)) {
                return typeCheckSuccess();
            }
            var typeName = this.name === "Date" ? "Date or a unix milliseconds timestamp" : this.name;
            return typeCheckFailure(context, value, "Value is not a " + typeName);
        };
        return CoreType;
    }(SimpleType));
    /**
     * `types.string` - Creates a type that can only contain a string value.
     * This type is used for string values by default
     *
     * Example:
     * ```ts
     * const Person = types.model({
     *   firstName: types.string,
     *   lastName: "Doe"
     * })
     * ```
     */
    // tslint:disable-next-line:variable-name
    var string = new CoreType("string", TypeFlags.String, function (v) { return typeof v === "string"; });
    /**
     * `types.number` - Creates a type that can only contain a numeric value.
     * This type is used for numeric values by default
     *
     * Example:
     * ```ts
     * const Vector = types.model({
     *   x: types.number,
     *   y: 1.5
     * })
     * ```
     */
    // tslint:disable-next-line:variable-name
    var number = new CoreType("number", TypeFlags.Number, function (v) { return typeof v === "number"; });
    /**
     * `types.integer` - Creates a type that can only contain an integer value.
     * This type is used for integer values by default
     *
     * Example:
     * ```ts
     * const Size = types.model({
     *   width: types.integer,
     *   height: 10
     * })
     * ```
     */
    // tslint:disable-next-line:variable-name
    var integer = new CoreType("integer", TypeFlags.Integer, function (v) { return isInteger(v); });
    /**
     * `types.boolean` - Creates a type that can only contain a boolean value.
     * This type is used for boolean values by default
     *
     * Example:
     * ```ts
     * const Thing = types.model({
     *   isCool: types.boolean,
     *   isAwesome: false
     * })
     * ```
     */
    // tslint:disable-next-line:variable-name
    var boolean = new CoreType("boolean", TypeFlags.Boolean, function (v) { return typeof v === "boolean"; });
    /**
     * `types.null` - The type of the value `null`
     */
    var nullType = new CoreType("null", TypeFlags.Null, function (v) { return v === null; });
    /**
     * `types.undefined` - The type of the value `undefined`
     */
    var undefinedType = new CoreType("undefined", TypeFlags.Undefined, function (v) { return v === undefined; });
    var _DatePrimitive = new CoreType("Date", TypeFlags.Date, function (v) { return typeof v === "number" || v instanceof Date; }, function (v) { return (v instanceof Date ? v : new Date(v)); });
    _DatePrimitive.getSnapshot = function (node) {
        return node.storedValue.getTime();
    };
    /**
     * `types.Date` - Creates a type that can only contain a javascript Date value.
     *
     * Example:
     * ```ts
     * const LogLine = types.model({
     *   timestamp: types.Date,
     * })
     *
     * LogLine.create({ timestamp: new Date() })
     * ```
     */
    var DatePrimitive = _DatePrimitive;
    /**
     * @internal
     * @hidden
     */
    function getPrimitiveFactoryFromValue(value) {
        switch (typeof value) {
            case "string":
                return string;
            case "number":
                return number; // In the future, isInteger(value) ? integer : number would be interesting, but would be too breaking for now
            case "boolean":
                return boolean;
            case "object":
                if (value instanceof Date)
                    return DatePrimitive;
        }
        throw fail$1$1("Cannot determine primitive type from value " + value);
    }
    /**
     * Returns if a given value represents a primitive type.
     *
     * @param type
     * @returns
     */
    function isPrimitiveType(type) {
        return (isType(type) &&
            (type.flags &
                (TypeFlags.String |
                    TypeFlags.Number |
                    TypeFlags.Integer |
                    TypeFlags.Boolean |
                    TypeFlags.Date)) >
                0);
    }

    /**
     * @internal
     * @hidden
     */
    var Literal = /** @class */ (function (_super) {
        __extends$1(Literal, _super);
        function Literal(value) {
            var _this = _super.call(this, JSON.stringify(value)) || this;
            _this.flags = TypeFlags.Literal;
            _this.value = value;
            return _this;
        }
        Literal.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            return createScalarNode(this, parent, subpath, environment, initialValue);
        };
        Literal.prototype.describe = function () {
            return JSON.stringify(this.value);
        };
        Literal.prototype.isValidSnapshot = function (value, context) {
            if (isPrimitive$1(value) && value === this.value) {
                return typeCheckSuccess();
            }
            return typeCheckFailure(context, value, "Value is not a literal " + JSON.stringify(this.value));
        };
        return Literal;
    }(SimpleType));
    /**
     * `types.literal` - The literal type will return a type that will match only the exact given type.
     * The given value must be a primitive, in order to be serialized to a snapshot correctly.
     * You can use literal to match exact strings for example the exact male or female string.
     *
     * Example:
     * ```ts
     * const Person = types.model({
     *     name: types.string,
     *     gender: types.union(types.literal('male'), types.literal('female'))
     * })
     * ```
     *
     * @param value The value to use in the strict equal check
     * @returns
     */
    function literal(value) {
        // check that the given value is a primitive
        assertArg(value, isPrimitive$1, "primitive", 1);
        return new Literal(value);
    }

    var Refinement = /** @class */ (function (_super) {
        __extends$1(Refinement, _super);
        function Refinement(name, _subtype, _predicate, _message) {
            var _this = _super.call(this, name) || this;
            _this._subtype = _subtype;
            _this._predicate = _predicate;
            _this._message = _message;
            return _this;
        }
        Object.defineProperty(Refinement.prototype, "flags", {
            get: function () {
                return this._subtype.flags | TypeFlags.Refinement;
            },
            enumerable: true,
            configurable: true
        });
        Refinement.prototype.describe = function () {
            return this.name;
        };
        Refinement.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            // create the child type
            return this._subtype.instantiate(parent, subpath, environment, initialValue);
        };
        Refinement.prototype.isAssignableFrom = function (type) {
            return this._subtype.isAssignableFrom(type);
        };
        Refinement.prototype.isValidSnapshot = function (value, context) {
            var subtypeErrors = this._subtype.validate(value, context);
            if (subtypeErrors.length > 0)
                return subtypeErrors;
            var snapshot = isStateTreeNode(value) ? getStateTreeNode(value).snapshot : value;
            if (!this._predicate(snapshot)) {
                return typeCheckFailure(context, value, this._message(value));
            }
            return typeCheckSuccess();
        };
        Refinement.prototype.reconcile = function (current, newValue, parent, subpath) {
            return this._subtype.reconcile(current, newValue, parent, subpath);
        };
        Refinement.prototype.getSubTypes = function () {
            return this._subtype;
        };
        return Refinement;
    }(BaseType));
    /**
     * `types.refinement` - Creates a type that is more specific than the base type, e.g. `types.refinement(types.string, value => value.length > 5)` to create a type of strings that can only be longer then 5.
     *
     * @param name
     * @param type
     * @param predicate
     * @returns
     */
    function refinement() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var name = typeof args[0] === "string" ? args.shift() : isType(args[0]) ? args[0].name : null;
        var type = args[0];
        var predicate = args[1];
        var message = args[2]
            ? args[2]
            : function (v) { return "Value does not respect the refinement predicate"; };
        // ensures all parameters are correct
        assertIsType(type, [1, 2]);
        assertIsString(name, 1);
        assertIsFunction(predicate, [2, 3]);
        assertIsFunction(message, [3, 4]);
        return new Refinement(name, type, predicate, message);
    }

    /**
     * `types.enumeration` - Can be used to create an string based enumeration.
     * (note: this methods is just sugar for a union of string literals)
     *
     * Example:
     * ```ts
     * const TrafficLight = types.model({
     *   color: types.enumeration("Color", ["Red", "Orange", "Green"])
     * })
     * ```
     *
     * @param name descriptive name of the enumeration (optional)
     * @param options possible values this enumeration can have
     * @returns
     */
    function enumeration(name, options) {
        var realOptions = typeof name === "string" ? options : name;
        // check all options
        if (devMode()) {
            realOptions.forEach(function (option, i) {
                assertIsString(option, i + 1);
            });
        }
        var type = union.apply(void 0, __spread$1(realOptions.map(function (option) { return literal("" + option); })));
        if (typeof name === "string")
            type.name = name;
        return type;
    }

    /**
     * @internal
     * @hidden
     */
    var Union = /** @class */ (function (_super) {
        __extends$1(Union, _super);
        function Union(name, _types, options) {
            var _this = _super.call(this, name) || this;
            _this._types = _types;
            _this._eager = true;
            options = __assign$1({ eager: true, dispatcher: undefined }, options);
            _this._dispatcher = options.dispatcher;
            if (!options.eager)
                _this._eager = false;
            return _this;
        }
        Object.defineProperty(Union.prototype, "flags", {
            get: function () {
                var result = TypeFlags.Union;
                this._types.forEach(function (type) {
                    result |= type.flags;
                });
                return result;
            },
            enumerable: true,
            configurable: true
        });
        Union.prototype.isAssignableFrom = function (type) {
            return this._types.some(function (subType) { return subType.isAssignableFrom(type); });
        };
        Union.prototype.describe = function () {
            return "(" + this._types.map(function (factory) { return factory.describe(); }).join(" | ") + ")";
        };
        Union.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            var type = this.determineType(initialValue, undefined);
            if (!type)
                throw fail$1$1("No matching type for union " + this.describe()); // can happen in prod builds
            return type.instantiate(parent, subpath, environment, initialValue);
        };
        Union.prototype.reconcile = function (current, newValue, parent, subpath) {
            var type = this.determineType(newValue, current.type);
            if (!type)
                throw fail$1$1("No matching type for union " + this.describe()); // can happen in prod builds
            return type.reconcile(current, newValue, parent, subpath);
        };
        Union.prototype.determineType = function (value, reconcileCurrentType) {
            // try the dispatcher, if defined
            if (this._dispatcher) {
                return this._dispatcher(value);
            }
            // find the most accomodating type
            // if we are using reconciliation try the current node type first (fix for #1045)
            if (reconcileCurrentType) {
                if (reconcileCurrentType.is(value)) {
                    return reconcileCurrentType;
                }
                return this._types.filter(function (t) { return t !== reconcileCurrentType; }).find(function (type) { return type.is(value); });
            }
            else {
                return this._types.find(function (type) { return type.is(value); });
            }
        };
        Union.prototype.isValidSnapshot = function (value, context) {
            if (this._dispatcher) {
                return this._dispatcher(value).validate(value, context);
            }
            var allErrors = [];
            var applicableTypes = 0;
            for (var i = 0; i < this._types.length; i++) {
                var type = this._types[i];
                var errors = type.validate(value, context);
                if (errors.length === 0) {
                    if (this._eager)
                        return typeCheckSuccess();
                    else
                        applicableTypes++;
                }
                else {
                    allErrors.push(errors);
                }
            }
            if (applicableTypes === 1)
                return typeCheckSuccess();
            return typeCheckFailure(context, value, "No type is applicable for the union").concat(flattenTypeErrors(allErrors));
        };
        Union.prototype.getSubTypes = function () {
            return this._types;
        };
        return Union;
    }(BaseType));
    /**
     * `types.union` - Create a union of multiple types. If the correct type cannot be inferred unambiguously from a snapshot, provide a dispatcher function of the form `(snapshot) => Type`.
     *
     * @param optionsOrType
     * @param otherTypes
     * @returns
     */
    function union(optionsOrType) {
        var otherTypes = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            otherTypes[_i - 1] = arguments[_i];
        }
        var options = isType(optionsOrType) ? undefined : optionsOrType;
        var types = isType(optionsOrType) ? __spread$1([optionsOrType], otherTypes) : otherTypes;
        var name = "(" + types.map(function (type) { return type.name; }).join(" | ") + ")";
        // check all options
        if (devMode()) {
            if (options) {
                assertArg(options, function (o) { return isPlainObject$1(o); }, "object { eager?: boolean, dispatcher?: Function }", 1);
            }
            types.forEach(function (type, i) {
                assertIsType(type, options ? i + 2 : i + 1);
            });
        }
        return new Union(name, types, options);
    }

    /**
     * @hidden
     * @internal
     */
    var OptionalValue = /** @class */ (function (_super) {
        __extends$1(OptionalValue, _super);
        function OptionalValue(_subtype, _defaultValue, optionalValues) {
            var _this = _super.call(this, _subtype.name) || this;
            _this._subtype = _subtype;
            _this._defaultValue = _defaultValue;
            _this.optionalValues = optionalValues;
            return _this;
        }
        Object.defineProperty(OptionalValue.prototype, "flags", {
            get: function () {
                return this._subtype.flags | TypeFlags.Optional;
            },
            enumerable: true,
            configurable: true
        });
        OptionalValue.prototype.describe = function () {
            return this._subtype.describe() + "?";
        };
        OptionalValue.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            if (this.optionalValues.indexOf(initialValue) >= 0) {
                var defaultInstanceOrSnapshot = this.getDefaultInstanceOrSnapshot();
                return this._subtype.instantiate(parent, subpath, environment, defaultInstanceOrSnapshot);
            }
            return this._subtype.instantiate(parent, subpath, environment, initialValue);
        };
        OptionalValue.prototype.reconcile = function (current, newValue, parent, subpath) {
            return this._subtype.reconcile(current, this.optionalValues.indexOf(newValue) < 0 && this._subtype.is(newValue)
                ? newValue
                : this.getDefaultInstanceOrSnapshot(), parent, subpath);
        };
        OptionalValue.prototype.getDefaultInstanceOrSnapshot = function () {
            var defaultInstanceOrSnapshot = typeof this._defaultValue === "function"
                ? this._defaultValue()
                : this._defaultValue;
            // while static values are already snapshots and checked on types.optional
            // generator functions must always be rechecked just in case
            if (typeof this._defaultValue === "function") {
                typecheckInternal(this, defaultInstanceOrSnapshot);
            }
            return defaultInstanceOrSnapshot;
        };
        OptionalValue.prototype.isValidSnapshot = function (value, context) {
            // defaulted values can be skipped
            if (this.optionalValues.indexOf(value) >= 0) {
                return typeCheckSuccess();
            }
            // bounce validation to the sub-type
            return this._subtype.validate(value, context);
        };
        OptionalValue.prototype.isAssignableFrom = function (type) {
            return this._subtype.isAssignableFrom(type);
        };
        OptionalValue.prototype.getSubTypes = function () {
            return this._subtype;
        };
        return OptionalValue;
    }(BaseType));
    function checkOptionalPreconditions(type, defaultValueOrFunction) {
        // make sure we never pass direct instances
        if (typeof defaultValueOrFunction !== "function" && isStateTreeNode(defaultValueOrFunction)) {
            throw fail$1$1("default value cannot be an instance, pass a snapshot or a function that creates an instance/snapshot instead");
        }
        assertIsType(type, 1);
        if (devMode()) {
            // we only check default values if they are passed directly
            // if they are generator functions they will be checked once they are generated
            // we don't check generator function results here to avoid generating a node just for type-checking purposes
            // which might generate side-effects
            if (typeof defaultValueOrFunction !== "function") {
                typecheckInternal(type, defaultValueOrFunction);
            }
        }
    }
    /**
     * `types.optional` - Can be used to create a property with a default value.
     *
     * Depending on the third argument (`optionalValues`) there are two ways of operation:
     * - If the argument is not provided, then if a value is not provided in the snapshot (`undefined` or missing),
     *   it will default to the provided `defaultValue`
     * - If the argument is provided, then if the value in the snapshot matches one of the optional values inside the array then it will
     *   default to the provided `defaultValue`. Additionally, if one of the optional values inside the array is `undefined` then a missing
     *   property is also valid.
     *
     *   Note that it is also possible to include values of the same type as the intended subtype as optional values,
     *   in this case the optional value will be transformed into the `defaultValue` (e.g. `types.optional(types.string, "unnamed", [undefined, ""])`
     *   will transform the snapshot values `undefined` (and therefore missing) and empty strings into the string `"unnamed"` when it gets
     *   instantiated).
     *
     * If `defaultValue` is a function, the function will be invoked for every new instance.
     * Applying a snapshot in which the optional value is one of the optional values (or `undefined`/_not_ present if none are provided) causes the
     * value to be reset.
     *
     * Example:
     * ```ts
     * const Todo = types.model({
     *   title: types.string,
     *   subtitle1: types.optional(types.string, "", [null]),
     *   subtitle2: types.optional(types.string, "", [null, undefined]),
     *   done: types.optional(types.boolean, false),
     *   created: types.optional(types.Date, () => new Date()),
     * })
     *
     * // if done is missing / undefined it will become false
     * // if created is missing / undefined it will get a freshly generated timestamp
     * // if subtitle1 is null it will default to "", but it cannot be missing or undefined
     * // if subtitle2 is null or undefined it will default to ""; since it can be undefined it can also be missing
     * const todo = Todo.create({ title: "Get coffee", subtitle1: null })
     * ```
     *
     * @param type
     * @param defaultValueOrFunction
     * @param optionalValues an optional array with zero or more primitive values (string, number, boolean, null or undefined)
     *                       that will be converted into the default. `[ undefined ]` is assumed when none is provided
     * @returns
     */
    function optional(type, defaultValueOrFunction, optionalValues) {
        checkOptionalPreconditions(type, defaultValueOrFunction);
        return new OptionalValue(type, defaultValueOrFunction, optionalValues ? optionalValues : undefinedAsOptionalValues);
    }
    var undefinedAsOptionalValues = [undefined];

    var optionalUndefinedType = optional(undefinedType, undefined);
    var optionalNullType = optional(nullType, null);
    /**
     * `types.maybe` - Maybe will make a type nullable, and also optional.
     * The value `undefined` will be used to represent nullability.
     *
     * @param type
     * @returns
     */
    function maybe(type) {
        assertIsType(type, 1);
        return union(type, optionalUndefinedType);
    }
    /**
     * `types.maybeNull` - Maybe will make a type nullable, and also optional.
     * The value `null` will be used to represent no value.
     *
     * @param type
     * @returns
     */
    function maybeNull(type) {
        assertIsType(type, 1);
        return union(type, optionalNullType);
    }

    var Late = /** @class */ (function (_super) {
        __extends$1(Late, _super);
        function Late(name, _definition) {
            var _this = _super.call(this, name) || this;
            _this._definition = _definition;
            return _this;
        }
        Object.defineProperty(Late.prototype, "flags", {
            get: function () {
                return (this._subType ? this._subType.flags : 0) | TypeFlags.Late;
            },
            enumerable: true,
            configurable: true
        });
        Late.prototype.getSubType = function (mustSucceed) {
            if (!this._subType) {
                var t = undefined;
                try {
                    t = this._definition();
                }
                catch (e) {
                    if (e instanceof ReferenceError)
                        // can happen in strict ES5 code when a definition is self refering
                        t = undefined;
                    else
                        throw e;
                }
                if (mustSucceed && t === undefined)
                    throw fail$1$1("Late type seems to be used too early, the definition (still) returns undefined");
                if (t) {
                    if (devMode() && !isType(t))
                        throw fail$1$1("Failed to determine subtype, make sure types.late returns a type definition.");
                    this._subType = t;
                }
            }
            return this._subType;
        };
        Late.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            return this.getSubType(true).instantiate(parent, subpath, environment, initialValue);
        };
        Late.prototype.reconcile = function (current, newValue, parent, subpath) {
            return this.getSubType(true).reconcile(current, newValue, parent, subpath);
        };
        Late.prototype.describe = function () {
            var t = this.getSubType(false);
            return t ? t.name : "<uknown late type>";
        };
        Late.prototype.isValidSnapshot = function (value, context) {
            var t = this.getSubType(false);
            if (!t) {
                // See #916; the variable the definition closure is pointing to wasn't defined yet, so can't be evaluted yet here
                return typeCheckSuccess();
            }
            return t.validate(value, context);
        };
        Late.prototype.isAssignableFrom = function (type) {
            var t = this.getSubType(false);
            return t ? t.isAssignableFrom(type) : false;
        };
        Late.prototype.getSubTypes = function () {
            var subtype = this.getSubType(false);
            return subtype ? subtype : cannotDetermineSubtype;
        };
        return Late;
    }(BaseType));
    /**
     * `types.late` - Defines a type that gets implemented later. This is useful when you have to deal with circular dependencies.
     * Please notice that when defining circular dependencies TypeScript isn't smart enough to inference them.
     *
     * Example:
     * ```ts
     *   // TypeScript isn't smart enough to infer self referencing types.
     *  const Node = types.model({
     *       children: types.array(types.late((): IAnyModelType => Node)) // then typecast each array element to Instance<typeof Node>
     *  })
     * ```
     *
     * @param name The name to use for the type that will be returned.
     * @param type A function that returns the type that will be defined.
     * @returns
     */
    function late(nameOrType, maybeType) {
        var name = typeof nameOrType === "string" ? nameOrType : "late(" + nameOrType.toString() + ")";
        var type = typeof nameOrType === "string" ? maybeType : nameOrType;
        // checks that the type is actually a late type
        if (devMode()) {
            if (!(typeof type === "function" && type.length === 0))
                throw fail$1$1("Invalid late type, expected a function with zero arguments that returns a type, got: " +
                    type);
        }
        return new Late(name, type);
    }

    /**
     * @internal
     * @hidden
     */
    var Frozen = /** @class */ (function (_super) {
        __extends$1(Frozen, _super);
        function Frozen(subType) {
            var _this = _super.call(this, subType ? "frozen(" + subType.name + ")" : "frozen") || this;
            _this.subType = subType;
            _this.flags = TypeFlags.Frozen;
            return _this;
        }
        Frozen.prototype.describe = function () {
            return "<any immutable value>";
        };
        Frozen.prototype.instantiate = function (parent, subpath, environment, value) {
            // create the node
            return createScalarNode(this, parent, subpath, environment, deepFreeze(value));
        };
        Frozen.prototype.isValidSnapshot = function (value, context) {
            if (!isSerializable(value)) {
                return typeCheckFailure(context, value, "Value is not serializable and cannot be frozen");
            }
            if (this.subType)
                return this.subType.validate(value, context);
            return typeCheckSuccess();
        };
        return Frozen;
    }(SimpleType));
    var untypedFrozenInstance = new Frozen();
    /**
     * `types.frozen` - Frozen can be used to store any value that is serializable in itself (that is valid JSON).
     * Frozen values need to be immutable or treated as if immutable. They need be serializable as well.
     * Values stored in frozen will snapshotted as-is by MST, and internal changes will not be tracked.
     *
     * This is useful to store complex, but immutable values like vectors etc. It can form a powerful bridge to parts of your application that should be immutable, or that assume data to be immutable.
     *
     * Note: if you want to store free-form state that is mutable, or not serializeable, consider using volatile state instead.
     *
     * Frozen properties can be defined in three different ways
     * 1. `types.frozen(SubType)` - provide a valid MST type and frozen will check if the provided data conforms the snapshot for that type
     * 2. `types.frozen({ someDefaultValue: true})` - provide a primitive value, object or array, and MST will infer the type from that object, and also make it the default value for the field
     * 3. `types.frozen<TypeScriptType>()` - provide a typescript type, to help in strongly typing the field (design time only)
     *
     * Example:
     * ```ts
     * const GameCharacter = types.model({
     *   name: string,
     *   location: types.frozen({ x: 0, y: 0})
     * })
     *
     * const hero = GameCharacter.create({
     *   name: "Mario",
     *   location: { x: 7, y: 4 }
     * })
     *
     * hero.location = { x: 10, y: 2 } // OK
     * hero.location.x = 7 // Not ok!
     * ```
     *
     * ```ts
     * type Point = { x: number, y: number }
     *    const Mouse = types.model({
     *         loc: types.frozen<Point>()
     *    })
     * ```
     *
     * @param defaultValueOrType
     * @returns
     */
    function frozen(arg) {
        if (arguments.length === 0)
            return untypedFrozenInstance;
        else if (isType(arg))
            return new Frozen(arg);
        else
            return optional(untypedFrozenInstance, arg);
    }

    function getInvalidationCause(hook) {
        switch (hook) {
            case Hook.beforeDestroy:
                return "destroy";
            case Hook.beforeDetach:
                return "detach";
            default:
                return undefined;
        }
    }
    var StoredReference = /** @class */ (function () {
        function StoredReference(value, targetType) {
            this.targetType = targetType;
            if (isValidIdentifier(value)) {
                this.identifier = value;
            }
            else if (isStateTreeNode(value)) {
                var targetNode = getStateTreeNode(value);
                if (!targetNode.identifierAttribute)
                    throw fail$1$1("Can only store references with a defined identifier attribute.");
                var id = targetNode.unnormalizedIdentifier;
                if (id === null || id === undefined) {
                    throw fail$1$1("Can only store references to tree nodes with a defined identifier.");
                }
                this.identifier = id;
            }
            else {
                throw fail$1$1("Can only store references to tree nodes or identifiers, got: '" + value + "'");
            }
        }
        StoredReference.prototype.updateResolvedReference = function (node) {
            var normalizedId = normalizeIdentifier(this.identifier);
            var root = node.root;
            var lastCacheModification = root.identifierCache.getLastCacheModificationPerId(normalizedId);
            if (!this.resolvedReference ||
                this.resolvedReference.lastCacheModification !== lastCacheModification) {
                var targetType = this.targetType;
                // reference was initialized with the identifier of the target
                var target = root.identifierCache.resolve(targetType, normalizedId);
                if (!target) {
                    throw new InvalidReferenceError("[mobx-state-tree] Failed to resolve reference '" + this.identifier + "' to type '" + this.targetType.name + "' (from node: " + node.path + ")");
                }
                this.resolvedReference = {
                    node: target,
                    lastCacheModification: lastCacheModification
                };
            }
        };
        Object.defineProperty(StoredReference.prototype, "resolvedValue", {
            get: function () {
                this.updateResolvedReference(this.node);
                return this.resolvedReference.node.value;
            },
            enumerable: true,
            configurable: true
        });
        return StoredReference;
    }());
    /**
     * @internal
     * @hidden
     */
    var InvalidReferenceError = /** @class */ (function (_super) {
        __extends$1(InvalidReferenceError, _super);
        function InvalidReferenceError(m) {
            var _this = _super.call(this, m) || this;
            Object.setPrototypeOf(_this, InvalidReferenceError.prototype);
            return _this;
        }
        return InvalidReferenceError;
    }(Error));
    /**
     * @internal
     * @hidden
     */
    var BaseReferenceType = /** @class */ (function (_super) {
        __extends$1(BaseReferenceType, _super);
        function BaseReferenceType(targetType, onInvalidated) {
            var _this = _super.call(this, "reference(" + targetType.name + ")") || this;
            _this.targetType = targetType;
            _this.onInvalidated = onInvalidated;
            _this.flags = TypeFlags.Reference;
            return _this;
        }
        BaseReferenceType.prototype.describe = function () {
            return this.name;
        };
        BaseReferenceType.prototype.isAssignableFrom = function (type) {
            return this.targetType.isAssignableFrom(type);
        };
        BaseReferenceType.prototype.isValidSnapshot = function (value, context) {
            return isValidIdentifier(value)
                ? typeCheckSuccess()
                : typeCheckFailure(context, value, "Value is not a valid identifier, which is a string or a number");
        };
        BaseReferenceType.prototype.fireInvalidated = function (cause, storedRefNode, referenceId, refTargetNode) {
            // to actually invalidate a reference we need an alive parent,
            // since it is a scalar value (immutable-ish) and we need to change it
            // from the parent
            var storedRefParentNode = storedRefNode.parent;
            if (!storedRefParentNode || !storedRefParentNode.isAlive) {
                return;
            }
            var storedRefParentValue = storedRefParentNode.storedValue;
            if (!storedRefParentValue) {
                return;
            }
            this.onInvalidated({
                cause: cause,
                parent: storedRefParentValue,
                invalidTarget: refTargetNode ? refTargetNode.storedValue : undefined,
                invalidId: referenceId,
                replaceRef: function (newRef) {
                    applyPatch(storedRefNode.root.storedValue, {
                        op: "replace",
                        value: newRef,
                        path: storedRefNode.path
                    });
                },
                removeRef: function () {
                    if (isModelType(storedRefParentNode.type)) {
                        this.replaceRef(undefined);
                    }
                    else {
                        applyPatch(storedRefNode.root.storedValue, {
                            op: "remove",
                            path: storedRefNode.path
                        });
                    }
                }
            });
        };
        BaseReferenceType.prototype.addTargetNodeWatcher = function (storedRefNode, referenceId) {
            var _this = this;
            // this will make sure the target node becomes created
            var refTargetValue = this.getValue(storedRefNode);
            if (!refTargetValue) {
                return undefined;
            }
            var refTargetNode = getStateTreeNode(refTargetValue);
            var hookHandler = function (_, refTargetNodeHook) {
                var cause = getInvalidationCause(refTargetNodeHook);
                if (!cause) {
                    return;
                }
                _this.fireInvalidated(cause, storedRefNode, referenceId, refTargetNode);
            };
            var refTargetDetachHookDisposer = refTargetNode.registerHook(Hook.beforeDetach, hookHandler);
            var refTargetDestroyHookDisposer = refTargetNode.registerHook(Hook.beforeDestroy, hookHandler);
            return function () {
                refTargetDetachHookDisposer();
                refTargetDestroyHookDisposer();
            };
        };
        BaseReferenceType.prototype.watchTargetNodeForInvalidations = function (storedRefNode, identifier, customGetSet) {
            var _this = this;
            if (!this.onInvalidated) {
                return;
            }
            var onRefTargetDestroyedHookDisposer;
            // get rid of the watcher hook when the stored ref node is destroyed
            // detached is ignored since scalar nodes (where the reference resides) cannot be detached
            storedRefNode.registerHook(Hook.beforeDestroy, function () {
                if (onRefTargetDestroyedHookDisposer) {
                    onRefTargetDestroyedHookDisposer();
                }
            });
            var startWatching = function (sync) {
                // re-create hook in case the stored ref gets reattached
                if (onRefTargetDestroyedHookDisposer) {
                    onRefTargetDestroyedHookDisposer();
                }
                // make sure the target node is actually there and initialized
                var storedRefParentNode = storedRefNode.parent;
                var storedRefParentValue = storedRefParentNode && storedRefParentNode.storedValue;
                if (storedRefParentNode && storedRefParentNode.isAlive && storedRefParentValue) {
                    var refTargetNodeExists = void 0;
                    if (customGetSet) {
                        refTargetNodeExists = !!customGetSet.get(identifier, storedRefParentValue);
                    }
                    else {
                        refTargetNodeExists = storedRefNode.root.identifierCache.has(_this.targetType, normalizeIdentifier(identifier));
                    }
                    if (!refTargetNodeExists) {
                        // we cannot change the reference in sync mode
                        // since we are in the middle of a reconciliation/instantiation and the change would be overwritten
                        // for those cases just let the wrong reference be assigned and fail upon usage
                        // (like current references do)
                        // this means that effectively this code will only run when it is created from a snapshot
                        if (!sync) {
                            _this.fireInvalidated("invalidSnapshotReference", storedRefNode, identifier, null);
                        }
                    }
                    else {
                        onRefTargetDestroyedHookDisposer = _this.addTargetNodeWatcher(storedRefNode, identifier);
                    }
                }
            };
            if (storedRefNode.state === NodeLifeCycle.FINALIZED) {
                // already attached, so the whole tree is ready
                startWatching(true);
            }
            else {
                if (!storedRefNode.isRoot) {
                    // start watching once the whole tree is ready
                    storedRefNode.root.registerHook(Hook.afterCreationFinalization, function () {
                        // make sure to attach it so it can start listening
                        if (storedRefNode.parent) {
                            storedRefNode.parent.createObservableInstanceIfNeeded();
                        }
                    });
                }
                // start watching once the node is attached somewhere / parent changes
                storedRefNode.registerHook(Hook.afterAttach, function () {
                    startWatching(false);
                });
            }
        };
        return BaseReferenceType;
    }(SimpleType));
    /**
     * @internal
     * @hidden
     */
    var IdentifierReferenceType = /** @class */ (function (_super) {
        __extends$1(IdentifierReferenceType, _super);
        function IdentifierReferenceType(targetType, onInvalidated) {
            return _super.call(this, targetType, onInvalidated) || this;
        }
        IdentifierReferenceType.prototype.getValue = function (storedRefNode) {
            if (!storedRefNode.isAlive)
                return undefined;
            var storedRef = storedRefNode.storedValue;
            return storedRef.resolvedValue;
        };
        IdentifierReferenceType.prototype.getSnapshot = function (storedRefNode) {
            var ref = storedRefNode.storedValue;
            return ref.identifier;
        };
        IdentifierReferenceType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            var identifier = isStateTreeNode(initialValue)
                ? getIdentifier(initialValue)
                : initialValue;
            var storedRef = new StoredReference(initialValue, this.targetType);
            var storedRefNode = createScalarNode(this, parent, subpath, environment, storedRef);
            storedRef.node = storedRefNode;
            this.watchTargetNodeForInvalidations(storedRefNode, identifier, undefined);
            return storedRefNode;
        };
        IdentifierReferenceType.prototype.reconcile = function (current, newValue, parent, subpath) {
            if (!current.isDetaching && current.type === this) {
                var compareByValue = isStateTreeNode(newValue);
                var ref = current.storedValue;
                if ((!compareByValue && ref.identifier === newValue) ||
                    (compareByValue && ref.resolvedValue === newValue)) {
                    current.setParent(parent, subpath);
                    return current;
                }
            }
            var newNode = this.instantiate(parent, subpath, undefined, newValue);
            current.die(); // noop if detaching
            return newNode;
        };
        return IdentifierReferenceType;
    }(BaseReferenceType));
    /**
     * @internal
     * @hidden
     */
    var CustomReferenceType = /** @class */ (function (_super) {
        __extends$1(CustomReferenceType, _super);
        function CustomReferenceType(targetType, options, onInvalidated) {
            var _this = _super.call(this, targetType, onInvalidated) || this;
            _this.options = options;
            return _this;
        }
        CustomReferenceType.prototype.getValue = function (storedRefNode) {
            if (!storedRefNode.isAlive)
                return undefined;
            var referencedNode = this.options.get(storedRefNode.storedValue, storedRefNode.parent ? storedRefNode.parent.storedValue : null);
            return referencedNode;
        };
        CustomReferenceType.prototype.getSnapshot = function (storedRefNode) {
            return storedRefNode.storedValue;
        };
        CustomReferenceType.prototype.instantiate = function (parent, subpath, environment, newValue) {
            var identifier = isStateTreeNode(newValue)
                ? this.options.set(newValue, parent ? parent.storedValue : null)
                : newValue;
            var storedRefNode = createScalarNode(this, parent, subpath, environment, identifier);
            this.watchTargetNodeForInvalidations(storedRefNode, identifier, this.options);
            return storedRefNode;
        };
        CustomReferenceType.prototype.reconcile = function (current, newValue, parent, subpath) {
            var newIdentifier = isStateTreeNode(newValue)
                ? this.options.set(newValue, current ? current.storedValue : null)
                : newValue;
            if (!current.isDetaching &&
                current.type === this &&
                current.storedValue === newIdentifier) {
                current.setParent(parent, subpath);
                return current;
            }
            var newNode = this.instantiate(parent, subpath, undefined, newIdentifier);
            current.die(); // noop if detaching
            return newNode;
        };
        return CustomReferenceType;
    }(BaseReferenceType));
    /**
     * `types.reference` - Creates a reference to another type, which should have defined an identifier.
     * See also the [reference and identifiers](https://github.com/mobxjs/mobx-state-tree#references-and-identifiers) section.
     */
    function reference(subType, options) {
        assertIsType(subType, 1);
        if (devMode()) {
            if (arguments.length === 2 && typeof arguments[1] === "string") {
                // istanbul ignore next
                throw fail$1$1("References with base path are no longer supported. Please remove the base path.");
            }
        }
        var getSetOptions = options ? options : undefined;
        var onInvalidated = options
            ? options.onInvalidated
            : undefined;
        if (getSetOptions && (getSetOptions.get || getSetOptions.set)) {
            if (devMode()) {
                if (!getSetOptions.get || !getSetOptions.set) {
                    throw fail$1$1("reference options must either contain both a 'get' and a 'set' method or none of them");
                }
            }
            return new CustomReferenceType(subType, {
                get: getSetOptions.get,
                set: getSetOptions.set
            }, onInvalidated);
        }
        else {
            return new IdentifierReferenceType(subType, onInvalidated);
        }
    }
    /**
     * `types.safeReference` - A safe reference is like a standard reference, except that it accepts the undefined value by default
     * and automatically sets itself to undefined (when the parent is a model) / removes itself from arrays and maps
     * when the reference it is pointing to gets detached/destroyed.
     *
     * The optional options parameter object accepts a parameter named `acceptsUndefined`, which is set to true by default, so it is suitable
     * for model properties.
     * When used inside collections (arrays/maps), it is recommended to set this option to false so it can't take undefined as value,
     * which is usually the desired in those cases.
     *
     * Strictly speaking it is a `types.maybe(types.reference(X))` (when `acceptsUndefined` is set to true, the default) and
     * `types.reference(X)` (when `acceptsUndefined` is set to false), both of them with a customized `onInvalidated` option.
     *
     * @param subType
     * @param options
     * @returns
     */
    function safeReference(subType, options) {
        var refType = reference(subType, __assign$1(__assign$1({}, options), { onInvalidated: function (ev) {
                ev.removeRef();
            } }));
        if (options && options.acceptsUndefined === false) {
            return refType;
        }
        else {
            return maybe(refType);
        }
    }

    var BaseIdentifierType = /** @class */ (function (_super) {
        __extends$1(BaseIdentifierType, _super);
        function BaseIdentifierType(name, validType) {
            var _this = _super.call(this, name) || this;
            _this.validType = validType;
            _this.flags = TypeFlags.Identifier;
            return _this;
        }
        BaseIdentifierType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            if (!parent || !(parent.type instanceof ModelType))
                throw fail$1$1("Identifier types can only be instantiated as direct child of a model type");
            return createScalarNode(this, parent, subpath, environment, initialValue);
        };
        BaseIdentifierType.prototype.reconcile = function (current, newValue, parent, subpath) {
            // we don't consider detaching here since identifier are scalar nodes, and scalar nodes cannot be detached
            if (current.storedValue !== newValue)
                throw fail$1$1("Tried to change identifier from '" + current.storedValue + "' to '" + newValue + "'. Changing identifiers is not allowed.");
            current.setParent(parent, subpath);
            return current;
        };
        BaseIdentifierType.prototype.isValidSnapshot = function (value, context) {
            if (typeof value !== this.validType) {
                return typeCheckFailure(context, value, "Value is not a valid " + this.describe() + ", expected a " + this.validType);
            }
            return typeCheckSuccess();
        };
        return BaseIdentifierType;
    }(SimpleType));
    /**
     * @internal
     * @hidden
     */
    var IdentifierType = /** @class */ (function (_super) {
        __extends$1(IdentifierType, _super);
        function IdentifierType() {
            var _this = _super.call(this, "identifier", "string") || this;
            _this.flags = TypeFlags.Identifier;
            return _this;
        }
        IdentifierType.prototype.describe = function () {
            return "identifier";
        };
        return IdentifierType;
    }(BaseIdentifierType));
    /**
     * @internal
     * @hidden
     */
    var IdentifierNumberType = /** @class */ (function (_super) {
        __extends$1(IdentifierNumberType, _super);
        function IdentifierNumberType() {
            return _super.call(this, "identifierNumber", "number") || this;
        }
        IdentifierNumberType.prototype.getSnapshot = function (node) {
            return node.storedValue;
        };
        IdentifierNumberType.prototype.describe = function () {
            return "identifierNumber";
        };
        return IdentifierNumberType;
    }(BaseIdentifierType));
    /**
     * `types.identifier` - Identifiers are used to make references, lifecycle events and reconciling works.
     * Inside a state tree, for each type can exist only one instance for each given identifier.
     * For example there couldn't be 2 instances of user with id 1. If you need more, consider using references.
     * Identifier can be used only as type property of a model.
     * This type accepts as parameter the value type of the identifier field that can be either string or number.
     *
     * Example:
     * ```ts
     *  const Todo = types.model("Todo", {
     *      id: types.identifier,
     *      title: types.string
     *  })
     * ```
     *
     * @returns
     */
    var identifier = new IdentifierType();
    /**
     * `types.identifierNumber` - Similar to `types.identifier`. This one will serialize from / to a number when applying snapshots
     *
     * Example:
     * ```ts
     *  const Todo = types.model("Todo", {
     *      id: types.identifierNumber,
     *      title: types.string
     *  })
     * ```
     *
     * @returns
     */
    var identifierNumber = new IdentifierNumberType();
    /**
     * @internal
     * @hidden
     */
    function normalizeIdentifier(id) {
        return "" + id;
    }
    /**
     * @internal
     * @hidden
     */
    function isValidIdentifier(id) {
        return typeof id === "string" || typeof id === "number";
    }

    /**
     * `types.custom` - Creates a custom type. Custom types can be used for arbitrary immutable values, that have a serializable representation. For example, to create your own Date representation, Decimal type etc.
     *
     * The signature of the options is:
     * ```ts
     * export interface CustomTypeOptions<S, T> {
     *     // Friendly name
     *     name: string
     *     // given a serialized value and environment, how to turn it into the target type
     *     fromSnapshot(snapshot: S, env: any): T
     *     // return the serialization of the current value
     *     toSnapshot(value: T): S
     *     // if true, this is a converted value, if false, it's a snapshot
     *     isTargetType(value: T | S): value is T
     *     // a non empty string is assumed to be a validation error
     *     getValidationMessage?(snapshot: S): string
     * }
     * ```
     *
     * Example:
     * ```ts
     * const DecimalPrimitive = types.custom<string, Decimal>({
     *     name: "Decimal",
     *     fromSnapshot(value: string) {
     *         return new Decimal(value)
     *     },
     *     toSnapshot(value: Decimal) {
     *         return value.toString()
     *     },
     *     isTargetType(value: string | Decimal): boolean {
     *         return value instanceof Decimal
     *     },
     *     getValidationMessage(value: string): string {
     *         if (/^-?\d+\.\d+$/.test(value)) return "" // OK
     *         return `'${value}' doesn't look like a valid decimal number`
     *     }
     * })
     *
     * const Wallet = types.model({
     *     balance: DecimalPrimitive
     * })
     * ```
     *
     * @param options
     * @returns
     */
    function custom(options) {
        return new CustomType(options);
    }
    /**
     * @internal
     * @hidden
     */
    var CustomType = /** @class */ (function (_super) {
        __extends$1(CustomType, _super);
        function CustomType(options) {
            var _this = _super.call(this, options.name) || this;
            _this.options = options;
            _this.flags = TypeFlags.Custom;
            return _this;
        }
        CustomType.prototype.describe = function () {
            return this.name;
        };
        CustomType.prototype.isValidSnapshot = function (value, context) {
            if (this.options.isTargetType(value))
                return typeCheckSuccess();
            var typeError = this.options.getValidationMessage(value);
            if (typeError) {
                return typeCheckFailure(context, value, "Invalid value for type '" + this.name + "': " + typeError);
            }
            return typeCheckSuccess();
        };
        CustomType.prototype.getSnapshot = function (node) {
            return this.options.toSnapshot(node.storedValue);
        };
        CustomType.prototype.instantiate = function (parent, subpath, environment, initialValue) {
            var valueToStore = this.options.isTargetType(initialValue)
                ? initialValue
                : this.options.fromSnapshot(initialValue, parent && parent.root.environment);
            return createScalarNode(this, parent, subpath, environment, valueToStore);
        };
        CustomType.prototype.reconcile = function (current, value, parent, subpath) {
            var isSnapshot = !this.options.isTargetType(value);
            // in theory customs use scalar nodes which cannot be detached, but still...
            if (!current.isDetaching) {
                var unchanged = current.type === this &&
                    (isSnapshot ? value === current.snapshot : value === current.storedValue);
                if (unchanged) {
                    current.setParent(parent, subpath);
                    return current;
                }
            }
            var valueToStore = isSnapshot
                ? this.options.fromSnapshot(value, parent.root.environment)
                : value;
            var newNode = this.instantiate(parent, subpath, undefined, valueToStore);
            current.die(); // noop if detaching
            return newNode;
        };
        return CustomType;
    }(SimpleType));

    // we import the types to re-export them inside types.
    var types = {
        enumeration: enumeration,
        model: model,
        compose: compose,
        custom: custom,
        reference: reference,
        safeReference: safeReference,
        union: union,
        optional: optional,
        literal: literal,
        maybe: maybe,
        maybeNull: maybeNull,
        refinement: refinement,
        string: string,
        boolean: boolean,
        number: number,
        integer: integer,
        Date: DatePrimitive,
        map: map,
        array: array,
        frozen: frozen,
        identifier: identifier,
        identifierNumber: identifierNumber,
        late: late,
        undefined: undefinedType,
        null: nullType,
        snapshotProcessor: snapshotProcessor
    };

    /* ---- Utilities ---- */
    const seq = (i) => [...Array(Math.round(i)).keys()];
    const randInt = (upper) => Math.floor(Math.random() * upper);
    const shuffleArray = arr => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = randInt(i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    /* ---- Label List ---- */
    const LabelList = types
        .model('Labels', {
        list: types.array(types.string),
        freeIndex: types.maybeNull(types.number),
    })
        .actions(self => ({
        add(text = '') {
            self.list.push(text);
        },
        delete(idx = null) {
            // Use 'cast' to avoid TypeScript errors
            if (idx)
                self.list = cast(self.list.filter((_, i) => i !== idx));
            else
                self.list.pop();
        },
        setFreeIndex(idx = null) {
            self.freeIndex = idx;
        },
    }))
        .views(self => ({
        get freeLabel() {
            return self.list[self.freeIndex];
        },
    }));
    /* ---- Square ---- */
    const Square = types
        .model('Square', {
        checked: false,
        free: false,
        label: 'Default label',
        col: 0,
        row: 0,
    })
        .actions(self => ({
        check() {
            self.checked = !self.checked;
        },
    }));
    /* ---- Board ---- */
    const Board = types
        .model('Board', {
        squares: types.array(Square),
        size: 5,
    })
        .views(self => {
        function getDim(dim = 'row') {
            if (['row', 'column'].includes(dim))
                return seq(self.size).map(i => self.squares.filter(sq => sq[dim] == i));
            return [];
        }
        return {
            get rows() {
                return getDim();
            },
            get columns() {
                return getDim('column');
            },
            get diagonals() {
                return seq(2).map(i => self.squares.filter(s => i ? s.row === self.size - s.col - 1 : s.row === s.col));
            },
            get completed() {
                const { rows, columns, diagonals, } = this;
                return (self.squares.length &&
                    [...rows, ...columns, ...diagonals].some(s => s.every(square => square.checked)));
            },
        };
    });
    /* ---- Build board ---- */
    const buildBoard = (labels, size = 5, randomFree = false) => {
        if (size && labels.list.length) {
            const numdecks = Math.ceil(size ** 2 / labels.list.length);
            const boardlabels = seq(numdecks)
                .flatMap(() => shuffleArray(labels.list))
                .slice(0, size ** 2);
            const freeIndex = randomFree ? randInt(size ** 2) : Math.floor(size ** 2 / 2);
            return Board.create({
                squares: boardlabels.map((label, i) => Square.create({
                    row: Math.floor(i / size),
                    col: i % size,
                    label: i === freeIndex ? labels.freeLabel : label,
                    free: i === freeIndex,
                    checked: i === freeIndex,
                })),
                size,
            });
        }
    };

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IE11 doesn't support classList on SVG elements, so we emulate it with a Set
    class ClassList {
        constructor(element) {
            this.classes = new Set();
            this.changed = false;
            this.element = element;
            const classList = (element.getAttribute('class') || '').split(/\s+/);
            for (const cls of classList) {
                this.classes.add(cls);
            }
        }
        add(cls) {
            this.classes.add(cls);
            this.changed = true;
        }
        remove(cls) {
            this.classes.delete(cls);
            this.changed = true;
        }
        commit() {
            if (this.changed) {
                let classString = '';
                this.classes.forEach((cls) => classString += cls + ' ');
                this.element.setAttribute('class', classString);
            }
        }
    }
    /**
     * Stores the ClassInfo object applied to a given AttributePart.
     * Used to unset existing values when a new ClassInfo object is applied.
     */
    const previousClassesCache = new WeakMap();
    /**
     * A directive that applies CSS classes. This must be used in the `class`
     * attribute and must be the only part used in the attribute. It takes each
     * property in the `classInfo` argument and adds the property name to the
     * element's `class` if the property value is truthy; if the property value is
     * falsey, the property name is removed from the element's `class`. For example
     * `{foo: bar}` applies the class `foo` if the value of `bar` is truthy.
     * @param classInfo {ClassInfo}
     */
    const classMap = directive((classInfo) => (part) => {
        if (!(part instanceof AttributePart) || (part instanceof PropertyPart) ||
            part.committer.name !== 'class' || part.committer.parts.length > 1) {
            throw new Error('The `classMap` directive must be used in the `class` attribute ' +
                'and must be the only part in the attribute.');
        }
        const { committer } = part;
        const { element } = committer;
        let previousClasses = previousClassesCache.get(part);
        if (previousClasses === undefined) {
            // Write static classes once
            // Use setAttribute() because className isn't a string on SVG elements
            element.setAttribute('class', committer.strings.join(' '));
            previousClassesCache.set(part, previousClasses = new Set());
        }
        const classList = (element.classList || new ClassList(element));
        // Remove old classes that no longer apply
        // We use forEach() instead of for-of so that re don't require down-level
        // iteration.
        previousClasses.forEach((name) => {
            if (!(name in classInfo)) {
                classList.remove(name);
                previousClasses.delete(name);
            }
        });
        // Add or remove classes based on their classMap value
        for (const name in classInfo) {
            const value = classInfo[name];
            if (value != previousClasses.has(name)) {
                // We explicitly want a loose truthy check of `value` because it seems
                // more convenient that '' and 0 are skipped.
                if (value) {
                    classList.add(name);
                    previousClasses.add(name);
                }
                else {
                    classList.remove(name);
                    previousClasses.delete(name);
                }
            }
        }
        if (typeof classList.commit === 'function') {
            classList.commit();
        }
    });

    const t_square = ({ check, checked, label, free }) => html `<style>
        button {
            display: inline-flex;
            border: 1px solid transparent;
            outline: none;
            justify-content: center;
        }

        button:hover {
            border-color: gray;
            background-color: rgb(200, 200, 255);
        }

        .checked,
        button:active {
            background-color: pink;
        }

        .free {
            pointer-events: none;
        }
    </style>
    <button class=${classMap({ checked, free })} @click=${check}>
        ${label}
    </button> `;
    const t_board = ({ squares, size }) => html `
    <style>
        #board {
            display: grid;
        }
    </style>
    <div
        id="board"
        style="grid-template-columns: repeat(${size}, 8em); grid-template-rows: repeat(${size}, 8em);"
    >
        ${squares.map(t_square)}
    </div>
`;
    const t_labellist = (labels) => html `
    <style>
        #container {
            display: grid;
            grid-template-columns: 16em 3em;
        }

        .free {
            color: red;
            background-color: pink;
        }
    </style>
    <div id="container">
        ${labels.list.map((item, i) => html `<div
                        class="${classMap({ free: i === labels.freeIndex })}"
                        @click=${() => {
    labels.setFreeIndex(i);
}}
                    >
                        ${item}
                    </div>
                    <button
                        @click=${() => {
    labels.delete(i);
}}
                    >
                        X
                    </button>`)}
    </div>
    <label for="item-add">New label:</label>
    <input
        type="text"
        name="item-add"
        @change=${({ target }) => {
    labels.add(target.value);
    target.value = '';
}}
    />
`;
    const t_completed = (completed) => html `${completed ? 'Win!' : ''}`;

    let game = observable({ board: Board.create({}) });
    const labels = LabelList.create({ list: [] });
    const genbtn = document.querySelector('#generate');
    genbtn.addEventListener('click', () => {
        game.board = buildBoard(labels, 5);
    });
    autorun(() => {
        if (game.board)
            render(t_board(game.board), document.querySelector('#app'));
        render(t_completed(game.board && game.board.completed), document.querySelector('#winmsg'));
        render(t_labellist(labels), document.querySelector('#newlabel'));
    });
    /*
    Purple: 97 39 81
    Green: 121 154 5
    Red: 186 36 84
    Yellow: 243 206 0
    */

}());
