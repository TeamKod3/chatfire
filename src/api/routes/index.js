const express = require('express')
const router = express.Router()
const instanceRoutes = require('./instance.route')
const messageRoutes = require('./message.route')
const miscRoutes = require('./misc.route')
const groupRoutes = require('./group.route')
const branchSet = require('../middlewares/branchSet')

router.get('/status', (req, res) => res.send('OK'))
router.use('/instance', branchSet,instanceRoutes)
router.use('/message', branchSet,messageRoutes)
router.use('/group', branchSet,groupRoutes)
router.use('/misc', branchSet,miscRoutes)

module.exports = router
