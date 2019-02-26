var express = require('express');
var router = express.Router();
//const helpers = require('../helpers/util')

module.exports = function (pool) {

  /* GET home page. */
  router.get('/', function (req, res, next) {
    res.render('login', {
      loginMessage: req.flash('loginMessage')
    });
  });

  router.post('/', function (req, res, next) {
    let email = req.body.email;
    let password = req.body.password;
    let sql = `select * from users where email = '${email}' and password = '${password}'`;

    pool.query(sql, (err, data) => {     // 1. AMBIL DARI DATABASE EMAIL DAN PASSWORD YANG DIINPUT USER
      if (data.rows.length > 0) {        // 2 A . JIKA EMAIL DAN PASSWORD BENAR
        req.session.user = data.rows[0].userid  // 3. SIMPAN DATA USER KE SESSION
        req.session.status = data.rows[0].status 
        res.redirect('/projects')        // 4. REDIRECT KE POAGE PROJECTS
      } else {                           // 2 B . JIKA EMAIL DAN PASSWORD SALAH
        req.flash('loginMessage', 'Email atau Password Salah');
        res.redirect('/')
      }

    })
  })
  router.get('/logout', function (req, res, next) {
    req.session.destroy(function (err) {
      res.redirect('/');
    });
  });
  return router;
}