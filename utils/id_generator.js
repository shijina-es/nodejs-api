// we are generating unique ids for user id

import dotenv from 'dotenv'
dotenv.config({path:'./utils/config.env'})

export default class id_generator
{
    constructor()
    {}
    async id_generator(type, length)
    {
        try
        {
            let characters= process.env.CHARACTERS
            let result= `${type}`
            for(let i=0; i< length; i++)
                result += characters.charAt(Math.floor(Math.random() * characters.length))

            //console.log('generated id',result)
            return result
        }
        catch(error){console.log(error);throw (error)}
    }
}