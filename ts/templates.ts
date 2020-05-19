import { html } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';
import { BoardType, LabelListType, SquareType } from './models';

const t_square = ({ check, checked, label, free }: SquareType) => html`<style>
        .square {
            display: inline-flex;
            margin: 2px;
            outline: none;
            border: none;
            justify-content: center;
            transition: background-color 0.25s;
        }

        button:hover.square {
            outline: 4px solid var(--jsb-secondary-color);
        }

        .checked,
        button:active.square,
        button:hover.checked.square {
            background-color: var(--jsb-primary-color);
            color: var(--jsb-secondary-color);
        }

        button.square.free-square {
            pointer-events: none;
        }
    </style>
    <button class="square ${classMap({ checked, 'free-square': free })}" @click=${check}>
        ${label}
    </button> `;

export const t_board = ({ squares, size }: BoardType) => html`
    <style>
        #board {
            display: grid;
            width: fit-content;
            background-color: var(--jsb-primary-color);
            padding: 2px;
            grid-template-columns: repeat(${size}, 8em);
            grid-template-rows: repeat(${size}, 8em);
        }
    </style>
    <div id="board">
        ${squares.map(t_square)}
    </div>
`;

export const t_labellist = (labels: LabelListType) => html`
    <style>
        #container {
            display: grid;
            grid-template-columns: 20em 1.5em;
            grid-auto-rows: 1.5em;
        }

        .free {
            color: red;
            background-color: pink;
        }
    </style>
    <label for="item-add">New label:</label>
    <input
        type="text"
        name="item-add"
        @change=${({ target }) => {
            labels.add(target.value);
            target.value = '';
        }}
    />
    <div id="container">
        ${labels.list.map(
            (item, i) =>
                html`<span
                        class="${classMap({ free: i === labels.freeIndex })}"
                        @click=${() => {
                            labels.setFreeIndex(i);
                        }}
                    >
                        ${item}
                    </span>
                    <button
                        @click=${() => {
                            labels.delete(i);
                        }}
                    >
                        X
                    </button>`
        )}
    </div>
`;

export const t_bingo = html`
    <style>
        #bingo-win-bg {
            position: fixed;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.9);
            top: 0;
            left: 0;
            overflow: hidden;
        }

        #bingo-win {
            top: 45vh;
            left: 50vw;
            transform: translate(-50%, -50%);
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            position: relative;
        }

        #bingo-win > * {
            padding: 0.5em;
            text-shadow: -1px -1px 1px var(--jsb-secondary-color),
                0 -1px 1px var(--jsb-secondary-color), 1px -1px 1px var(--jsb-secondary-color),
                1px 0 1px var(--jsb-secondary-color), 1px 1px 1px var(--jsb-secondary-color),
                0 1px 1px var(--jsb-secondary-color), -1px 1px 1px var(--jsb-secondary-color),
                -1px 0 1px var(--jsb-secondary-color);
            color: var(--jsb-primary-color);
        }

        @keyframes slidein {
            from {
                transform: translateY(100vh);
            }

            to {
                transform: translateY(0);
            }
        }

        @keyframes fadein {
            from {
                opacity: 0;
            }

            to {
                opacity: 1;
            }
        }
    </style>
    <div id="bingo-win-bg">
        <div id="bingo-win" @click=${() => location.reload()}>
            <div style="animation-duration: 0.5s; animation-name: slidein; font-size: 4em;">
                You achieved Bingo.
            </div>
            <button
                id="btn-restart"
                style="opacity: 0; animation-duration: 1s; animation-name: fadein; animation-delay: 0.5s; animation-fill-mode: forwards; font-size: 2em;"
            >
                True.
            </button>
        </div>
    </div>
`;

export const t_completed = (completed: boolean) => html`${completed ? t_bingo : html``}`;
