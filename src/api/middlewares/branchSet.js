global.production = true

function branchSet(req, res, next) {
    const branch = req.get('branch') || req.headers['branch'];
    console.log({ branch})
    global.production = branch === 'prod'
    next()
}

module.exports = branchSet
