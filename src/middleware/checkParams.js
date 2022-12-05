const moment = require('moment')

const checkParams = async (req, res, next) => {
    let isValid = true
    Object.keys(req.params).forEach(param => {
        if(isNaN(req.params[param])) isValid = false
    })
    if (isValid) next()
    else res.status(500).json({error: 'invalid parameters'})
}

const validateDates = async (req, res, next) => {
    const { start, end } = req.query
    var dateStart = moment(start);
    var dateEnd = moment(end);
    const isValid = (dateStart && dateEnd && moment(start).isBefore(dateEnd)) 
    if (!isValid) res.status(500).json({error: 'invalid date'}).end()
    else next()
}


module.exports = { checkParams, validateDates }