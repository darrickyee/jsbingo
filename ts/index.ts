import { html, render } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';
import { autorun } from 'mobx';
import { types } from 'mobx-state-tree';

const seq = (i: number) => [...Array(Math.round(i)).keys()];

const shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
        return a;
    }
};

const Labels = types
    .model('Labels', {
        list: types.array(types.string),
        items: types.array(types.string),
        center: 'FREE',
    })
    .actions(self => ({
        shuffle(size = self.list.length) {
            self.items.clear();
            if (self.list.length) {
                const decks = Math.ceil(size / self.list.length);
                const labels = seq(decks)
                    .map(() => shuffle(self.list))
                    .flat();

                self.items.push(...labels.slice(0, size));
            }
        },
        add(text = '') {
            self.list.push(text);
        },
        delete(text = '') {
            if (text) self.list.remove(text);
            else self.list.pop();
        },
    }));

const Square = types
    .model('Square', {
        checked: false,
        free: false,
        label: 'Default label',
        column: 0,
        row: 0,
    })
    .actions(self => ({
        check() {
            self.checked = !self.checked;
        },
        setCenter(label = 'FREE') {
            self.checked = true;
            self.free = true;
        },
    }));

const Board = types
    .model('Board', {
        squares: types.array(Square),
        labels: types.optional(Labels, { list: ['Label 1', 'Label 2', 'Label 3'] }),
        size: 5,
        active: false,
    })
    .actions(self => ({
        generate(size = self.size) {
            if (self.labels.list.length) {
                self.labels.shuffle(self.size ** 2);
                const squares = seq(size)
                    .map(i =>
                        seq(size).map(j =>
                            Square.create({
                                row: i,
                                column: j,
                                label: `${self.labels.items[i * size + j]}`,
                            })
                        )
                    )
                    .flat();

                const ctr = Math.floor(size / 2);
                squares.find(s => s.row === ctr && s.column === ctr).setCenter();
                self.squares.clear();
                self.squares.push(...squares);
                self.active = true;
            }
        },
    }))
    .views(self => ({
        getDim(dim = 'row') {
            if (['row', 'column'].includes(dim))
                return seq(self.size).map(i => self.squares.filter(sq => sq[dim] == i));

            return [];
        },
        get rows() {
            return this.getDim();
        },
        get columns() {
            return this.getDim('column');
        },
        get diagonals() {
            return seq(2).map(i =>
                self.squares.filter(s =>
                    i ? s.row === self.size - s.column - 1 : s.row === s.column
                )
            );
        },
        get completed() {
            const { rows, columns, diagonals } = this;
            return (
                self.squares.length &&
                [...rows, ...columns, ...diagonals].some(s => s.every(square => square.checked))
            );
        },
    }));

const labels = Labels.create({ list: [] });
const b = Board.create({ labels });
Object.assign(window, { board: b, labels });

const t_square = ({ check, checked, label, free }) => html`<style>
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

const t_board = ({ squares, size }) => html`
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

const t_msg = completed => html`${completed ? 'Win!' : ''}`;

const t_labels = labels => html`
    <style>
        #container {
            display: grid;
            grid-template-columns: 16em 3em;
        }
    </style>
    <div id="container">
        ${labels.list.map(
            item =>
                html`<div>${item}</div>
                    <button
                        @click=${() => {
                            labels.delete(item);
                        }}
                    >
                        X
                    </button>`
        )}
    </div>
    <label for="item-add">New label:</label>
    <input
        type="text"
        name="item-add"
        @change=${({ target: { value } }) => {
            labels.add(value);
        }}
    />
`;

const genbtn = document.querySelector('#generate');
genbtn.addEventListener('click', () => b.generate());

autorun(() => {
    if (b.active) render(t_board(b), document.querySelector('#app'));
    render(t_msg(b.completed), document.querySelector('#winmsg'));
    render(t_labels(labels), document.querySelector('#newlabel'));
});

/*
Purple: 97 39 81
Green: 121 154 5
Red: 186 36 84
Yellow: 243 206 0
*/
