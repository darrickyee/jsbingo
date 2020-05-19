import { render } from 'lit-html';
import { autorun, observable } from 'mobx';
import { buildBoard, LabelList, LabelListType, BoardType, Board } from './models';
import { t_board, t_labellist, t_completed } from './templates';

let game = observable({ board: Board.create({}), mode: 'config' });

const labels = LabelList.create({ list: window['MYLABELS'] || [] });

const genbtn = document.querySelector('#generate');
genbtn.addEventListener('click', () => {
    if (labels.list.length) {
        game.board = buildBoard(labels, 5);
        game.mode = 'play';
    }
});

autorun(() => {
    switch (game.mode) {
        case 'config':
            render(t_labellist(labels), document.querySelector('#labels'));
            break;
        case 'play':
            render(t_board(game.board), document.querySelector('#board-host'));
            render(t_completed(game.board.completed), document.querySelector('#win'));
            break;
        default:
            break;
    }
});

Object.assign(window, { game });

/*
Purple: 97 39 81
Green: 121 154 5
Red: 186 36 84
Yellow: 243 206 0
*/
