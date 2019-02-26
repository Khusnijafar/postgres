var express = require('express');
var router = express.Router();
const helpers = require('../helpers/util')
const moment = require('moment')
var path = require('path');

module.exports = function (pool) {
  //======================================================MainProjects==============================================//
  router.get('/', helpers.isLoggedIn, function (req, res, next) {
    //res.render('projects');
    console.log(req.url);
    const url = req.query.page ? req.url : '/?page=1';
    const page = req.query.page || 1;
    const limit = 3;
    const offset = (page - 1) * limit
    let searching = false;
    let params = [];
    let status = req.session.status

    if (req.query.checkid && req.query.id) {
      params.push(`projects.projectid = ${req.query.id}`);
      searching = true;
    }
    if (req.query.checkname && req.query.name) {
      params.push(`projects.name ilike '%${req.query.name}%'`);
      searching = true;
    }
    if (req.query.checkmember && req.query.member) {
      params.push(`concat (users.firstname,' ',users.lastname) = '${req.query.member}'`);
      searching = true;
    }
    //menghitung jumlah data
    let sql = `select count(id) as total from (select distinct projects.projectid as id from projects
          left join members on projects.projectid = members.projectid
          left join users on members.userid = users.userid`

    if (searching) {
      sql += ` where ${params.join(' and ')}`
    }

    sql += `) as project_member`;
    console.log('count query', sql);

    pool.query(sql, (err, data) => {
      console.log('INI SQL :', sql)
      const totalPages = data.rows[0].total;
      const pages = Math.ceil(totalPages / limit)
      //menampilkan data dari project
      sql = `select distinct projects.projectid, projects.name from projects 
        left join members on projects.projectid = members.projectid
        left join users on members.userid = users.userid`

      if (searching) {
        sql += ` where ${params.join(' and ')}`
      }

      sql += ` order by projects.projectid limit ${limit} offset ${offset}`
      // utk membatasi query member brdsrkn project yg akan diolah saja
      let subquery = `select projectid from projects`
      if (searching) {
        subquery += ` where ${params.join(' and ')}`
      }

      subquery += ` order by projectid limit ${limit} offset ${offset}`
      console.log('project list', subquery);

      //mdptkn data member brdsrkn project
      let sqlMembers = `select projects.projectid, concat (users.firstname,' ',users.lastname) as
         fullname from members inner join projects on members.projectid = projects.projectid inner join users on users.userid 
         = members.userid where projects.projectid in (${subquery})`;

      //console.log('load members', sqlMembers);
      pool.query(sql, (err, projectData) => {
        //console.log('INI SQL :',sql)
        pool.query(sqlMembers, (err, memberData) => {
          projectData.rows.map(project => {
            project.members = memberData.rows.filter(member => {
              return member.projectid == project.projectid
            }).map(item => item.fullname)
          })
          //console.log('data jadi', projectData.rows);
          // ambil semua data dari users untuk select filter member
          pool.query(`select concat(firstname, ' ', lastname) as fullname from users`, (err, usersData) => {
            // opsi checkbox utk menampilkan kolom di tabel
            pool.query(`select option -> 'option1' as o1, option -> 'option2' as o2, option -> 'option3' as o3 from users
             where userid=${req.session.user}`, (err, data) => {
              let columnOne = data.rows[0].o1;
              let columnTwo = data.rows[0].o2;
              let columnThree = data.rows[0].o3;

              res.render('projects/list', {
                data: projectData.rows,
                users: usersData.rows,
                pagination: {
                  pages,
                  page,
                  totalPages,
                  url
                },
                query: req.query,
                columnOne,
                columnTwo,
                columnThree,
                user: req.session.user,
                status
              })
            })
          })
        })
      })
    })
  })

  // =================================================Option Checklist==================================================

  router.post('/option', (req, res, next) => {
    let option1 = false;
    let option2 = false;
    let option3 = false;

    if (req.body.dataid) {
      option1 = true;
    }
    if (req.body.dataname) {
      option2 = true;
    }
    if (req.body.datamember) {
      option3 = true;
    }
    let sql = `update users set option = option :: jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' where userid = ${req.session.user}`;
    pool.query(sql, (err) => {
      console.log('INI SQL :', sql)
      if (err) {
        console.log(err);
      }
      res.redirect('/projects')
    })
  })

  //================================================ADD ON PROJECTS=====================================================

  router.get('/add', function (req, res, next) {
    pool.query('select * from users order by userid', (err, data) => {
      if (err) return res.send(err)
      res.render('projects/add', {
        users: data.rows
      });
    })
  });

  router.post('/add', function (req, res, next) {
    // console.log(req.body.name);
    pool.query(`insert into projects (name) values ('${req.body.name}')`, (err) => {
      if (err) return res.send(err)
      if (req.body.users) {

        pool.query(`select max(projectid) from projects`, (err, latestId) => {
          if (err) return res.send(err)
          let projectId = latestId.rows[0].max;
          if (Array.isArray(req.body.users)) {
            let values = [];
            req.body.users.forEach((item) => {
              values.push(`${projectId}, ${item.split("#")[0]}, '${item.split("#")[1]}')`);
            })
            let sqlMembers = `insert into members (projectid, userid, role) values `
            sqlMembers += values.join(', ')
            //console.log("query buat masukin members", sqlMembers);

            pool.query(sqlMembers, (err) => {
              if (err) return res.send(err)
              res.redirect('/projects');
            });
          } else {

            pool.query(`insert into members (projectid, userid, role) values (${projectId}, ${req.body.users.split("#")[0]}, '${req.body.users.split("#")[1]}')`, (err) => {
              if (err) return res.send(err)
              res.redirect('/projects');
            });
          }
        })
      } else {
        res.redirect('/projects')
      }
    });
  });

  //=================================================Edit ON PROJECTS===================================================

  router.get('/edit/:id', helpers.isLoggedIn, function (req, res, next) {
    let id = req.params.id;
    pool.query(`select * from projects where projectid = ${id}`, (err, projectData) => {
      if (err) return res.send(err)
      pool.query(`select userid from members where projectid = ${id}`, (err, memberData) => {
        if (err) return res.send(err)
        pool.query('select userid, firstname, lastname, position from users order by userid', (err, userData) => {
          if (err) return res.send(err)
          res.render('projects/edit', {
            project: projectData.rows[0],
            members: memberData.rows.map(item => item.userid), //[1,3,5]
            users: userData.rows
          })
        })
      })
    });
  });

  router.post('/edit/:id', (req, res, next) => {

    let id = req.params.id;
    let projectname = req.body.name;

    pool.query(`UPDATE projects set name='${projectname}' where projectid = ${id}`, (err) => {
      if (err) return res.send(err)

      pool.query(`DELETE FROM members where projectid = ${id}`, (err) => {
        if (err) return res.send(err)
        if (req.body.users) {
          if (Array.isArray(req.body.users)) {
            let values = [];
            req.body.users.forEach((item) => {
              values.push(`(${id}, ${item.split("#")[0]}, '${item.split("#")[1]}')`);
            })
            let sqlMembers = `insert into members (projectid, userid, role) values `
            sqlMembers += values.join(', ')
            //console.log("query buat masukin members", sqlMembers);

            pool.query(sqlMembers, (err) => {
              if (err) return res.send(err)
              res.redirect('/projects');
            });
          } else {

            pool.query(`insert into members (projectid, userid, role) values (${id}, ${req.body.users.split("#")[0]}, '${req.body.users.split("#")[1]}')`, (err) => {
              if (err) return res.send(err)
              res.redirect('/projects');
            });
          }
        } else {
          res.redirect('/projects');
        }
      })
    })
  })

  //================================================Delete on Projects==================================================
  router.get('/delete/:id', function (req, res, next) {
    let id = req.params.id;
    let role = req.session.user.role
    if (role){
    pool.query(`delete from members where projectid = ${id}`, (err) => {
      if (err) return res.send(err)
      pool.query(`delete from projects where projectid= ${id}`, (err) => {
        if (err) return res.send(err)
        console.log('data berhasil dihapus');
        res.redirect('/projects')
      })
    })
  }
  })

  //===============================================Overview===============================================================

  router.get('/overview/:projectid', helpers.isLoggedIn, function (req, res, next) {
    let projectid = req.params.projectid;

    let bug = 0
    let bugOpen = 0

    let feature = 0
    let featureOpen = 0

    let support = 0
    let supportOpen = 0

    // let sqlMembers = `SELECT CONCAT(firstname,' ',lastname) AS fullname FROM users WHERE userid IN (SELECT userid FROM members WHERE projectid = ${projectid})`
    pool.query(`select count(*) from issues where tracker ilike 'bug' and projectid = ${projectid}`, (err, dataA) => {
      bug = dataA.rows[0].count
      pool.query(`select count(*) from issues where tracker ilike 'bug' and (issues.status ilike 'New' or issues.status ilike 'In Progress' or issues.status ilike 'Feedback') and projectid = ${projectid}`, (err, dataB) => {
        bugOpen = dataB.rows[0].count

        pool.query(`select count(*) from issues where tracker ilike 'feature' and projectid = ${projectid}`, (err, dataC) => {
          feature = dataC.rows[0].count
          pool.query(`select count(*) from issues where tracker ilike 'feature' and (issues.status ilike 'New' or issues.status ilike 'In Progress' or issues.status ilike 'Feedback') and projectid = ${projectid}`, (err, dataD) => {
            featureOpen = dataD.rows[0].count

            pool.query(`select count (*) from issues where tracker ilike 'support' and projectid = ${projectid}`, (err, dataE) => {
              support = dataE.rows[0].count
              pool.query(`select count(*) from issues where tracker ilike 'support' and (issues.status ilike 'New' or issues.status ilike 'In Progress' or issues.status ilike 'Feedback') and projectid = ${projectid}`, (err, dataF) => {
                supportOpen = dataF.rows[0].count

                pool.query(`select concat(firstname,' ',lastname) as fullname from users where userid in (select userid from members where projectid = ${projectid})`, (err, members) => {

                  pool.query(`select * from projects where projectid = ${projectid}`, (err, projectData) => {
                    if (err) return res.send(err)
                    res.render('overview/view', {
                      members: members.rows,
                      projectid,
                      bug,
                      bugOpen,
                      feature,
                      featureOpen,
                      support,
                      supportOpen,
                      project: projectData.rows[0]
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  });

  //===========================================Main Members=============================================================

  router.get('/members/:projectid', helpers.isLoggedIn, function (req, res, next) {
    let projectid = req.params.projectid
    const url = req.query.page ? req.url : `/members/${projectid}/?page=1`;
    const page = req.query.page || 1;
    const limit = 3;
    const offset = (page - 1) * limit
    let searching = false;
    let params = [];

    if (req.query.checkid && req.query.id) {
      params.push(`members.id = ${req.query.id}`);
      searching = true;
    }

    if (req.query.checkname && req.query.fullname) {
      params.push(`concat (firstname,' ',lastname) ilike '%${req.query.fullname}%'`);
      searching = true;
    }

    if (req.query.checkposition && req.query.role) {
      params.push(`role = ${req.query.role}`);
      searching = true;
    }
    //menghitung jumlah data
    let sql = `select count(*) as total from members left join users on members.userid = users.userid where projectid = ${projectid}`
    if (searching) {
      sql += ` and ${params.join(' and ')}`
    }

    pool.query(sql, (err, count) => {
      const totalPages = count.rows[0].total;
      const pages = Math.ceil(totalPages / limit)
      //menampilkan data dari member
      let sql1 = `select members.id, concat(users.firstname,' ',users.lastname) as fullname, members.role 
                  from members left join users on members.userid = users.userid where projectid = ${projectid}`
      if (searching) {
        sql1 += ` and ${params.join(' and ')}`
      }

      sql1 += ` order by members.id limit ${limit} offset ${offset}`

      pool.query(sql1, (err, data) => {
        //console.log(err, data);

        pool.query(`select option_members -> 'option1' as o1, option_members -> 'option2' as o2, option_members -> 'option3' as o3 from users
             where userid=${req.session.user}`, (err, opsi) => {
          let columnOne = opsi.rows[0].o1;
          let columnTwo = opsi.rows[0].o2;
          let columnThree = opsi.rows[0].o3;

          res.render('members/list', {
            projectid,
            data: data.rows,
            //option: option.rows[0].option_members,
            pagination: {
              pages,
              url,
              page,
              totalPages
            },
            query: req.query,
            columnOne,
            columnTwo,
            columnThree,
            user: req.session.user
          })
        })
      })
    });
  })

  // ======================================== Option checklist (members) ===============================================

  router.post('/members/:projectid/option', (req, res, next) => {
    //console.log('router ini jalan', req.body);
    let id = req.params.projectid;
    let option1 = false;
    let option2 = false;
    let option3 = false;

    if (req.body.id) {
      option1 = true;
    }
    if (req.body.fullname) {
      option2 = true;
    }
    if (req.body.role) {
      option3 = true;
    }

    let sql = `update users set option_members = option_members::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' where userid = ${req.session.user}`;
    console.log('sql:', sql);
    pool.query(sql, (err) => {
      if (err) {
        console.log(err);
      }
      res.redirect(`/projects/members/${id}`)
    })
  })

  //===================================================Add on Members==================================================
  router.get('/members/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
    let projectid = req.params.projectid;
    pool.query(`select userid, concat(firstname,' ',lastname) as fullname, position from users where userid not in
    (select userid from members where projectid = ${projectid})`, (err, userData) => {
      if (err) return res.send(err)
      res.render('members/add', {
        users: userData.rows,
        positions: helpers.positionEnum,
        projectid
      })
    })
  })

  router.post('/members/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
    pool.query(`insert into members (userid, projectid, role) values (${req.body.user}, ${req.params.projectid}, '${req.body.position}')`, (err, userData) => {
      if (err) return res.send(err)
      res.redirect(`/projects/members/${req.params.projectid}`)
    })
  })

  //============================================Edit ON Members========================================================
  router.get('/members/:projectid/edit/:id', helpers.isLoggedIn, function (req, res, next) {
    let projectid = req.params.projectid;
    let id = req.params.id;

    pool.query(`select members.*, concat(users.firstname,' ',users.lastname) as fullname from members left join users on members.userid = users.userid where id = ${id}`, (err, memberData) => {
      if (err) return res.send(err)

      res.render('members/edit', {
        member: memberData.rows[0],
        position: helpers.positionEnum,
        projectid
      })
    })
  })

  router.post('/members/:projectid/edit/:id', helpers.isLoggedIn, function (req, res, next) {
    let id = req.params.id;

    pool.query(`update members set role = '${req.body.position}' where id = ${id}`, (err, memberData) => {
      if (err) return res.send(err)
      res.redirect(`/projects/members/${req.params.projectid}`)
    })
  })



  //==================================================Delete on Members================================================
  router.get('/members/:projectid/delete/:id', function (req, res, next) {
    let id = req.params.projectid
    pool.query(`delete from members where projectid = ${id} and id = ${req.params.id}`, (err) => {
      if (err) return res.send(err)
      //console.log('data berhasil dihapus');
      res.redirect(`/projects/members/${id}`)
    })
  })

  //=====================================================Issues=========================================================

  router.get('/issues/:projectid', helpers.isLoggedIn, function (req, res, next) {
    let projectid = req.params.projectid
    const url = req.query.page ? req.url : `/issues/${projectid}/?page=1`;
    const page = req.query.page || 1;
    const limit = 3;
    const offset = (page - 1) * limit
    let searching = false;
    let params = [];

    if (req.query.checkid && req.query.issueid) {
      params.push(`issues.issueid = ${req.query.issueid}`)
      searching = true;
    }
    if (req.query.checksubject && req.query.subject) {
      params.push(`issues.subject ilike '%${req.query.subject}%'`)
      searching = true;
    }
    if (req.query.checktracker && req.query.tracker) {
      params.push(`issues.tracker = '${req.query.tracker}'`)
      searching = true;
    }

    //menghitung jumlah data
    let sql = `select count(*) as total from issues where projectid = ${projectid}`
    if (searching) {
      sql += ` and ${params.join(' and ')}`
    }

    pool.query(sql, (err, count) => {
      const totalPages = count.rows[0].total;
      const pages = Math.ceil(totalPages / limit)

      sql = `select * from issues where projectid = ${projectid}`;
      if (searching) {
        sql += ` and ${params.join(' and ')}`
      }
      sql += ` order by projectid limit ${limit} offset ${offset}`;

      pool.query(sql, (err, dataissues) => {

        pool.query(`select option_issues -> 'option1' as o1, option_issues -> 'option2' as o2, option_issues -> 'option3' as o3 from users
        where userid=${req.session.user}`, (err, opsi) => {
          let columnOne = opsi.rows[0].o1;
          let columnTwo = opsi.rows[0].o2;
          let columnThree = opsi.rows[0].o3;

          res.render('issues/list', {
            projectid,
            data: dataissues.rows,
            pagination: {
              pages,
              url,
              page,
              totalPages
            },
            query: req.query,
            columnOne,
            columnTwo,
            columnThree,
            user: req.session.user
          })
        })
      })
    })
  })

  // ======================================== Option checklist (Issues) ===============================================

  router.post('/issues/:projectid/option', (req, res, next) => {
    //console.log('router ini jalan', req.body);
    let id = req.params.projectid;
    let option1 = false;
    let option2 = false;
    let option3 = false;

    if (req.body.id) {
      option1 = true;
    }
    if (req.body.subject) {
      option2 = true;
    }
    if (req.body.tracker) {
      option3 = true;
    }

    let sql = `update users set option_issues = option_issues::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' where userid = ${req.session.user}`;
    console.log('sql:', sql);
    pool.query(sql, (err) => {
      if (err) {
        console.log(err);
      }
      res.redirect(`/projects/issues/${id}`)
    })
  })

  //===================================================Add on Issues==================================================
  router.get('/issues/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
    let projectid = req.params.projectid;

    pool.query(`select concat(firstname,' ',lastname) as fullname, members.userid from members left join users on members.userid = users.userid where members.projectid = ${projectid}`, (err, memberName) => {

      pool.query(`select name from projects where projectid = ${req.params.projectid}`, (err, data) => {

        res.render('issues/add', {
          projectid,
          projectname: data.rows[0].name,
          assignee: memberName.rows
        })
      })
    })
  })

  router.post('/issues/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
    // console.log(req.body);
    let projectId = req.params.projectid;
    let x = req.body;
    let file = req.files.filedoc;
    let filename = file.name.toLowerCase().replace('', Date.now());

    //logger by activity


    let sql = `insert into issues (projectid, tracker, subject, description, status, 
               priority, assignee, startdate, duedate, estimatedtime, done, files, createddate) values 
               (${projectId},'${x.tracker}','${x.subject}','${x.description}',
               '${x.status}','${x.priority}',${x.assignee},'${x.startdate}',
               '${x.duedate}',${x.etime},${x.done},'${filename}', current_timestamp)`

    if (req.files) {
      file.mv(path.join(__dirname, `../public/file_upload/${filename}`), function (err) {
        if (err) console.log(err)
      })
    }

    pool.query(sql, (err) => {
      if (err) return res.send(err)
      res.redirect(`/projects/issues/${projectId}`)
    })
  })


  // ===================================================Issues Edit=======================================================
  router.get('/issues/:projectid/edit/:issueid', helpers.isLoggedIn, function (req, res) {

    let projectid = req.params.projectid;

    let issueid = req.params.issueid
    let sqlmembers = `select concat(firstname,' ',lastname) as fullname,members.userid  
    from members left join users on members.userid = users.userid  
    where members.projectid = ${projectid}`

    pool.query(`select issueid, subject from issues where projectid = ${projectid}`, (err, dataTask) => {
      pool.query(`select * from issues where issueid = ${issueid}`, (err, dataissue) => {
        pool.query(sqlmembers, (err, memberName) => {
          pool.query(`select name from projects where projectid = ${projectid}`, (err, data) => {

            res.render('issues/edit', {
              projectid,
              projectname: data.rows[0].name,
              assignee: memberName.rows,
              dataisu: dataissue.rows[0],
              moment,
              issueid,
              datatask: dataTask.rows
            })
          })
        })
      })
    })
  })

  router.post('/issues/:projectid/edit/:issueid', helpers.isLoggedIn, function (req, res, next) {
    console.log(req.body);
    let projectId = req.params.projectid;
    let x = req.body;
    let file = req.files.filedoc;
    let filename = file.name.toLowerCase().replace('', Date.now());

    //logger by activity
    let author = `${req.session.user}`
    let sqLog = `insert into activity (issueid, time, subject, description, author, status) values
                 (${req.params.issueid}, current_timestamp, '${x.subject}', '${x.description}', ${author}, '${x.status}')`



    let sql1 = `update issues set projectid = ${x.projectid}, tracker= '${x.tracker}', 
               subject = '${x.subject}', description = '${x.description}', status = '${x.status}', 
               priority = '${x.priority}', assignee = ${x.assignee}, startdate = '${x.startdate}', 
               duedate = '${x.duedate}', estimatedtime = ${x.etime}, done = ${x.done}, files = '${filename}', 
               spenttime =  ${x.spenttime}, targetversion = '${x.targetversion}', author = ${author}, updateddate = current_timestamp 
               where issueid = ${x.issueid}`

    let sql2 = `update issues set projectid = ${x.projectid}, tracker= '${x.tracker}', 
               subject = '${x.subject}', description = '${x.description}', status = '${x.status}', 
               priority = '${x.priority}', assignee = ${x.assignee}, startdate = '${x.startdate}', 
               duedate = '${x.duedate}', estimatedtime = ${x.etime}, done = ${x.done}, files = '${filename}', 
               spenttime =  ${x.spenttime}, targetversion = '${x.targetversion}', author = ${author},
               closeddate = current_timestamp  where issueid = ${x.issueid}`


    //console.log(sql);
    if (req.files) {
      file.mv(path.join(__dirname, `../public/file_upload/${filename}`), function (err) {
        if (err) console.log(err)
      })
    }

    if (x.status == 'Closed') {
      pool.query(sql2, (err) => {
        console.log('SQL2', sql2);
        if (err) return res.send(err)
        pool.query(sqLog, (err) => {
          if (err) return res.send(err)
          res.redirect(`/projects/issues/${projectId}`)
        })
      })
    } else {
      pool.query(sql1, (err) => {
        console.log('SQL1', sql1);
        if (err) return res.send(err)
        pool.query(sqLog, (err) => {
          if (err) return res.send(err)
          res.redirect(`/projects/issues/${projectId}`)
        })
      })
    }
  })

  // ===================================================Issues Delete=====================================================
  router.get('/issues/:projectid/delete/:issueid', function (req, res, next) {
    let id = req.params.projectid
    pool.query(`delete from issues where projectid = ${id} and issueid = ${req.params.issueid}`, (err) => {
      if (err) return res.send(err)
      //console.log('data berhasil dihapus');
      res.redirect(`/projects/issues/${id}`)
    })
  })
  // ===================================================Activity===========================================================
  router.get('/activity/:projectid', helpers.isLoggedIn, function (req, res) {
    let projectid = req.params.projectid
    const today = new Date();
    const sevenDaysBefore = new Date(today.getTime() - (6 * 24 * 60 * 60 * 1000));
    const sql1 = `select activity.*, concat(users.firstname,' ',users.lastname) as fullname from activity left join users on activity.author = users.userid
    where time between '${moment(sevenDaysBefore).format('YYYY-MM-DD')}'
    and '${moment(today).add(1, 'days').format('YYYY-MM-DD')}' order by time desc`;
    let sql = `SELECT * FROM activity where projectid = ${projectid}`


    pool.query(sql1, (err, data) => {
      let result = {};
      data.rows.forEach((item) => {
        if (result[moment(item.time).format('dddd')] && result[moment(item.time).format('dddd')].data) {
          result[moment(item.time).format('dddd')].data.push(item);
        } else {
          result[moment(item.time).format('dddd')] = {
            date: moment(item.time).format('YYYY-MM-DD'),
            data: [item]
          };
        }
      })
      console.log(JSON.stringify(result));
      pool.query(sql, (err, data) => {
        //console.log(data.rows)
        res.render('activity/view', {
          projectid,
          data: result,
          today,
          sevenDaysBefore,
          moment,
        })
      })
    })
  })
  return router;
}