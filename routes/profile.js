var express = require('express');
var router = express.Router();
var helpers = require('../helpers/util');

module.exports = function (pool) {

    router.get('/', helpers.isLoggedIn, function (req, res, next) {
        //console.log('terkoneksi');
        pool.query(`SELECT * from users where userid = ${req.session.user}`, (err, data) => {
            //console.log(data.rows);
            if (err) {
                console.log(err);
            }
            res.render('profile/view', { 
                data: data.rows[0] 
            })
        })
    })

    router.post('/:id', (req, res, next) => {

        let sql = `UPDATE users SET password = '${req.body.password}', position = '${req.body.position}', type = ${(req.body.type ? true : false)} where userid = ${req.session.user}`
        pool.query(sql, (err) => {
            console.log(sql);

            if (err) {
                console.log(err);
            }
            res.redirect('/profile')
        })
    })
    return router;
};