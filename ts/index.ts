import { render } from 'lit-html';
import { autorun, observable } from 'mobx';
import { buildBoard, LabelList, LabelListType, BoardType, Board } from './models';
import { t_board, t_labellist, t_completed } from './templates';

let game = observable({ board: Board.create({}) });

const labels = LabelList.create({ list: [] });

const genbtn = document.querySelector('#generate');
genbtn.addEventListener('click', () => {
    game.board = buildBoard(labels, 5);
});

autorun(() => {
    if (game.board) render(t_board(game.board), document.querySelector('#app'));
    render(t_completed(game.board && game.board.completed), document.querySelector('#winmsg'));
    render(t_labellist(labels), document.querySelector('#newlabel'));
});

/*
Purple: 97 39 81
Green: 121 154 5
Red: 186 36 84
Yellow: 243 206 0
*/
