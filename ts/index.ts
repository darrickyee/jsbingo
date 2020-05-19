import { html, render } from 'lit-html';
import { autorun, observable } from 'mobx';
import { classMap } from 'lit-html/directives/class-map';
import { buildBoard, LabelList, Board } from './models';
import { t_board, t_labellist, t_bingo } from './templates';

let game = observable({ board: Board.create({}), mode: 'config' });

const generate = () => {
    if (labels.list.length) {
        game.board = buildBoard(labels, 5);
        game.mode = 'play';
    }
};

const labels = LabelList.create({ list: window['_LABELS_'] || [] });

const t_game = game => html`
    <div class="game-host">
        <button
            class=${classMap({ activated: game.mode === 'config' })}
            @click=${() => (game.mode = 'config')}
        >
            Config</button
        ><button class=${classMap({ activated: game.mode === 'play' })} @click=${generate}>
            Play
        </button>
    </div>
    <div class="game-host">
        <div
            class="game-stage"
            style="transform: translateY(${game.mode === 'config' ? '0' : '-100vh'})"
        >
            ${t_labellist(labels)}
        </div>
        <div
            class="game-stage"
            style="transform: translateY(${game.mode === 'play' ? '0' : '100vh'})"
        >
            ${t_board(game.board)}
        </div>
        ${game.board.completed ? t_bingo(generate) : html``}
    </div>
`;

autorun(() => {
    render(t_game(game), document.querySelector('#app'));
});

Object.assign(window, { game });

/*
Purple: 97 39 81
Green: 121 154 5
Red: 186 36 84
Yellow: 243 206 0
*/
