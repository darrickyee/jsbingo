import { html } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';
import { BoardType, LabelListType, SquareType } from './models';

const t_square = ({ check, checked, label, free }: SquareType) => html`
    <button class="square ${classMap({ checked, 'free-square': free })}" @click=${check}>
        ${label}
    </button>
`;

export const t_board = ({ squares, size }: BoardType) => html`
    <style>
        #board {
            display: grid;
            width: fit-content;
            background-color: var(--jsb-primary-color);
            padding: 2px;
            grid-template-columns: repeat(${size}, var(--jsb-square-size));
            grid-template-rows: repeat(${size}, var(--jsb-square-size));
        }
    </style>
    <div id="board">
        ${squares.map(t_square)}
    </div>
`;

export const t_labellist = (labels: LabelListType) => html`
    <div>Current label count: ${labels.numLabels}</div>
    <div>
        <label for="item-add">Add a label:</label>
        <input
            type="text"
            name="item-add"
            @change=${({ target }) => {
                labels.add(target.value);
                target.value = '';
            }}
        />
    </div>
    <div id="label-list-container">
        ${labels.list.map(
            (item, i) =>
                html`<span
                        class="label-item ${classMap({ free: i === labels.freeIndex })}"
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

export const t_bingo = restart => html`
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
        <div id="bingo-win" @click=${restart}>
            <div
                class="outline-text"
                style="animation-duration: 0.5s; animation-name: slidein; font-size: 4em; text-align: center;"
            >
                You achieved Bingo.
            </div>
            <button
                class="outline-text"
                id="btn-restart"
                style="opacity: 0; animation-duration: 1s; animation-name: fadein; animation-delay: 0.5s; animation-fill-mode: forwards; font-size: 2em;"
            >
                True.
            </button>
        </div>
    </div>
`;

export const t_completed = (completed: boolean) => html`${completed ? t_bingo : html``}`;
