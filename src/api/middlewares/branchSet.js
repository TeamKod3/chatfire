global.production = true

function branchSet(req, res, next) {
    const branch = req.get('branch') || req.headers['branch'];
    console.log({branch})
    if(!branch) {
        console.log('entrou no if de não existir branch')
        global.production = true
    } else {
        console.log('branch existe')
        global.production = branch === 'prod'
    }
    next()
}

module.exports = branchSet
