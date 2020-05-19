import { html, render } from 'lit-html';
import { autorun, observable } from 'mobx';
import { getSnapshot, applySnapshot } from 'mobx-state-tree';
import { classMap } from 'lit-html/directives/class-map';
import { buildBoard, LabelList, Board } from './models';
import { t_board, t_labellist, t_bingo } from './templates';

let game = observable({ board: Board.create({}), mode: 'setup' });

const lastGame = Board.create({});

const generate = () => {
    if (labels.list.length) {
        game.board = buildBoard(labels, 5);
        game.mode = 'play';
    }
};

const win = () => {
    applySnapshot(lastGame, getSnapshot(game.board));
    generate();
    game.mode = 'last';
};

const getStagePosition = (mode: 'setup' | 'play' | 'last') =>
    `translateY(${-100 * (['setup', 'play', 'last'].indexOf(mode) / 3)}%)`;

const labels = LabelList.create({ list: window['_LABELS_'] || [] });

const t_game = game => html`
    <div class="game-nav">
        <button
            class=${classMap({ activated: game.mode === 'setup' })}
            @click=${() => (game.mode = 'setup')}
        >
            Setup</button
        ><button class=${classMap({ activated: game.mode === 'play' })} @click=${generate}>
            Play
        </button>
        <button
            class=${classMap({ activated: game.mode === 'last' })}
            @click=${() => (game.mode = 'last')}
        >
            Last
        </button>
    </div>
    <div class="game-stage">
        <div class="game-stage-grid" style="transform: ${getStagePosition(game.mode)};">
            <div class="game-stage-item">
                ${t_labellist(labels)}
            </div>
            <div class="game-stage-item">
                ${t_board(game.board)}
            </div>
            <div class="game-stage-item" style="pointer-events: none;">
                ${lastGame.squares.length ? t_board(lastGame) : 'No past games to display!'}
            </div>
        </div>
        ${game.board.completed ? t_bingo(win) : html``}
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
