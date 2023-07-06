const express = require('express')
const controller = require('../controllers/instance.controller')
const keyVerify = require('../middlewares/keyCheck')
const loginVerify = require('../middlewares/loginCheck')

const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('./user_stats.db');

const router = express.Router()

router.route('/init').get(controller.init)
router.route('/qr').get(keyVerify, controller.qr)
router.route('/qrbase64').get(keyVerify, controller.qrbase64)
router.route('/info').get(keyVerify, controller.info)
router.route('/restore').get(controller.restore)
router.route('/logout').delete(keyVerify, loginVerify, controller.logout)
router.route('/delete').delete(keyVerify, controller.delete)
router.route('/list').get(controller.list)

router.get('/getstats', keyVerify, loginVerify, (req, res) => {
    const userKey = req.query.key; 

    db.all('SELECT endpoint, upload_count, received_count FROM user_stats WHERE user_key = ?', [userKey], function(err, rows) {
        if (err) {
            console.error(err);
            res.status(500).send('Ocorreu um erro ao buscar as estatísticas.');
            return;
        }

        const stats = {
            sent: {},
            received: {}
        };
        for (let row of rows) {
            stats.sent[row.endpoint] = row.upload_count;
            stats.received[row.endpoint] = row.received_count;
        }

        res.json(stats);
    });
});


module.exports = router