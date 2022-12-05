const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { validateDates, checkParams } = require('./middleware/checkParams')
const { Op } = require('sequelize');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile ,checkParams, async (req, res) =>{
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const contract = await Contract.findOne({ where: { id, clientId:  req.get('profile_id') } })
    if (!contract) return res.status(404).end()
    res.json(contract)
})

app.get('/contracts', getProfile, async (req, res) => {
    const {Contract} = req.app.get('models')
    const contracts = await Contract.findAll(
        {
            where: {
                [Op.or]: [
                    { clientId: req.get('profile_id') },
                    { ContractorId: req.get('profile_id') }
                ],
                status: { [Op.ne]: 'terminated' }
            }
        }
    )
    if (!contracts.length) return res.status(404).end()
    res.json(contracts)
})

app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const {Job} = req.app.get('models')
    const jobs = await Job.findAll(
        {
            include: [{
                model: req.app.get('models').Contract,
                where: {
                [Op.or]: [
                    { clientId: req.get('profile_id') },
                    { ContractorId: req.get('profile_id') }
                ],
                status: { [Op.ne]: 'terminated' },
                },
                attributes: []
            }],
            where: {
                paid: { [Op.not]: true },
            },
        }
    )
    if (!jobs.length) return res.status(404).end()
    res.json(jobs)
})

app.post('/jobs/:job_id/pay', getProfile, checkParams, async (req, res) => {
    const { job_id } = req.params
    const { Job } = req.app.get('models')
    const query = (paid = true) => ({
            include: [{
                model: req.app.get('models').Contract,
                where: {
                    clientId: req.get('profile_id'),
                    status: { [Op.ne]: 'terminated' }
                },
                include: [{
                    model: req.app.get('models').Profile,
                    as: 'Contractor'
                }, {
                    model: req.app.get('models').Profile,
                    as: 'Client'
                }],
            }],
            where: {
                paid: { [Op.not]: paid },
                id: job_id
            }
        })
    const job = await Job.findOne(query())
    if (!job) return res.status(404).end()
    let message = ''
    const { Contract: { Contractor, Client }, price } = job
    await sequelize.transaction(async (transaction) => {
        if ((Client.balance >= price)) {
            await job.update({ paid: true }, { transaction })
            Client.balance-=price
            await Client.save({transaction})
            Contractor.balance += price
            await Contractor.save({ transaction })
            message = 'payment successful'
            job.save({transaction})
            return
        } 
        message = 'not enough balance'
    })
    const finalJob = await Job.findOne(query(false))
    res.json({message, finalJob})
})

app.post('/balances/deposit/:userId', getProfile, checkParams, async (req, res) => {
    const { userId } = req.params
    const { amount } = req.body
    const profile_id = req.get('profile_id')
    if(isNaN(amount)) return res.status(500).json({error: 'invalid parameters'}).end()
    const profile = await req.app.get('models').Profile.findOne(
        {
            where: { id: profile_id, type: 'client' },
            include: [
                {
                    model: req.app.get('models').Contract,
                    as: 'Client',
                    include: [
                        {
                        model: req.app.get('models').Job
                        }
                    ]
                }
            ]
        }
    )
    
    if (!profile) return res.status(404).end()
    
    const jobs = profile.Client.map(contract => contract.Jobs)
    const totalJobsDebt = jobs.flat().reduce((acc, cv) => acc + cv.price, 0)
    
    let message = ''
    let client
    if (amount <= totalJobsDebt * .75) {
        await sequelize.transaction(async (transaction) => {
            client = await req.app.get('models').Profile.findByPk(userId)
            if (!client) return res.status(404).end()
            client.balance = client.balance + amount
            await client.save({ transaction })
            message = `new balance for client ${client.id} is ${client.balance}`
            profile.balance = profile.balance - amount
            await profile.save({ transaction })
        })
    }
    res.json({message, client})
})

app.get('/admin/best-profession', getProfile, validateDates, async (req, res) => {
    const { start, end } = req.query
    const profiles = await req.app.get('models').Profile.findAll(
        {
            where: { type: 'contractor' },
            include: [
                {
                    model: req.app.get('models').Contract,
                    as: 'Contractor',
                    required: true,
                    include: [
                        {
                            model: req.app.get('models').Job,
                            where: { paymentDate: { [Op.between]: [start, end] }, paid: true },
                            required: true,
                            attributes: ['price']
                        }
                    ]
                }
            ]
        }
    )
        
    if (!profiles.length) return res.status(404).end()
    const professions = []
    profiles.forEach((profile) => {
        professions[profile.profession] = (professions[profile.profession]) ? [...professions[profile.profession], ...profile.Contractor.flatMap(contractor => contractor.Jobs)].reduce((acc, cv) => acc + cv.dataValues.price, 0) : []
    });

    const total = Math.max(...Object.keys(professions).map(o => professions[o]))
    let profession = ''
    Object.keys(professions).forEach(key => {
        if (professions[key] === total) profession = key
    })
    res.json(`${profession}: ${total}`).end()

})

app.get('/admin/best-clients', getProfile, validateDates, async (req, res) => {
    const { start, end, limit = 2 } = req.query
    const profiles = await req.app.get('models').Profile.findAll(
        {
            where: { type: 'contractor' },
            include: [
                {
                    model: req.app.get('models').Contract,
                    as: 'Contractor',
                    required: true,
                    // attributes: [],
                    include: [
                        {
                            model: req.app.get('models').Job,
                            where: { paymentDate: { [Op.between]: [start, end] }, paid: true },
                            required: true,
                            attributes: ['price']
                        }
                    ]
                }
            ]
        }
    )
        
    if (!profiles.length) return res.status(404).end()
    const professions = []
    profiles.forEach((profile) => {
        professions.push({
            id: profile.id,
            fullName: `${profile.firstName} ${profile.lastName}`,
            total: [...professions[profile.id] || [], ...profile.Contractor.flatMap(contractor => contractor.Jobs)].reduce((acc, cv) => acc + cv.dataValues.price, 0)
        })
    });

    const response = professions.sort((a, b) => (a.total > b.total) ? 1 : -1).slice(-limit)

    res.json(response).end()
})



module.exports = app;
