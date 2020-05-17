import { html } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';
import { BoardType, LabelListType, SquareType } from './models';

const t_square = ({ check, checked, label, free }: SquareType) => html`<style>
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

export const t_board = ({ squares, size }: BoardType) => html`
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

export const t_labellist = (labels: LabelListType) => html`
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
        ${labels.list.map(
            (item, i) =>
                html`<div
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
                    </button>`
        )}
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

export const t_completed = (completed: boolean) => html`${completed ? 'Win!' : ''}`;
