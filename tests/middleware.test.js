const { validateDates, checkParams } = require('../src/middleware/checkParams')

let reqMock = { }
let resMock = { }
    
describe('middlewares: ', () => {
    beforeEach(() => {
        reqMock = {
            params: {},
            query: {}
        }
        resMock = {
            send: function () { },
            json: function (err) {
                console.log("\n : " + err);
            }
        }

    })
    describe('checkParams: ', () => {
        test('should call next(): ', () => {
            const nextMock = jest.fn()
            reqMock.params.id = 1
            reqMock.params.job_id = 2
            checkParams(reqMock, resMock, nextMock)
            expect(nextMock.mock.calls.length).toBe(1)
        })

        test('should response with error: ', () => {
            resMock = {
                ...resMock, ...{
                    status: function() { return this },
                    json:   function() { return this },
                    end: function () {
                        return this
                    }
            }}
            const nextMock = jest.fn()
            reqMock.params.id = "d"
            reqMock.params.job_id = 2
            checkParams(reqMock, resMock, nextMock)
            expect(nextMock.mock.calls.length).toBe(0)
            expect(resMock.status().json().toString()).toBe({error: 'invalid parameters'}.toString())
        })
    })

    describe('validateDates: ', () => {
        test('should call next(): ', () => {
            const nextMock = jest.fn()
            reqMock.query.start = '2010-08-16T19:11:26.737Z'
            reqMock.query.end = '2020-08-16T19:11:26.737Z'
            
            validateDates(reqMock, resMock, nextMock)
            
            expect(nextMock.mock.calls.length).toBe(1)
        })
        test('should response with error if start > end: ', () => {
            resMock = {
                ...resMock, ...{
                    status: function() { return this },
                    json:   function() { return this },
                    end: function () {
                        return this
                    }
            }}
            const nextMock = jest.fn()
            reqMock.query.start = '2020-08-16T19:11:26.737Z'
            reqMock.query.end = '2010-08-16T19:11:26.737Z'
            
            validateDates(reqMock, resMock, nextMock)
            
            expect(nextMock.mock.calls.length).toBe(0)
            expect(resMock.status().json().toString()).toBe({error: 'invalid date'}.toString())
        })
        test('should response with error when invalid date: ', () => {
            resMock = {
                ...resMock, ...{
                    status: function() { return this },
                    json:   function() { return this },
                    end: function () {
                        return this
                    }
            }}
            const nextMock = jest.fn()
            reqMock.query.start = '20-08-16T19:11:26.737Z'
            reqMock.query.end = '2010-08-16T19:11:26.737Z'
            
            validateDates(reqMock, resMock, nextMock)
            
            expect(nextMock.mock.calls.length).toBe(0)
            expect(resMock.status().json().toString()).toBe({error: 'invalid date'}.toString())
        })
    })

})

