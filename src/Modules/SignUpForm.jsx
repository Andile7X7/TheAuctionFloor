
import styles from '../Modules/SignUpForm.module.css'
import { FaGoogle } from "react-icons/fa";
import React, { useState } from 'react';
import { supabase } from '../Modules/SupabaseClient'



    const SignUp = () =>{

        const [formData,setFormData] = useState({
            FirstName:'',LastName:'',email:'',password:''
        })
    


        function handleChange(event){
            setFormData((prevFormData)=>{
                return{
                    ...prevFormData,
                    [event.target.name]:event.target.value
                }
            })
        }

        async function handleSubmit(e){
            e.preventDefault()

            try{
                const {data, error} = await supabase.auth.signUp(
                    {
                        email:formData.email,
                        password:formData.password,
                        options:{
                            data:{
                                FirstName:formData.FirstName,
                                LastName:formData.LastName,
                            }
                        }
                    }
                )
                if (error) throw error
                alert('check your email for verification link')
            } catch (error){
                alert (error)
            }
        }

        async function handleGoogleSignIn() {
            try {
                const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: `${window.location.origin}/auth/callback`,
                    },
                });
                if (error) throw error;
            } catch (error) {
                alert(error.message);
            }
        }


    return(
        <>
        <div className={styles.Wrapper}>
            <div className={styles.FormContainer}>
                <p id={styles.SignUpText}>Sign Up</p>
                <p id={styles.SignUpSubText}>Access automotive listings &<br/> live auction events </p>
               <form onSubmit={handleSubmit} className={styles.form}>

                    <div className={styles.FormSection}>
                    <label htmlFor="FirtsName">Name</label>
                    <input type="text" id='FirstName' name='FirstName' onChange={handleChange} required/>
                    </div>

                    <div className={styles.FormSection}>
                    <label htmlFor="LastName">Surname</label>
                    <input type="text" id='LastName' name='LastName' onChange={handleChange} required/>
                    </div>


                    <div className={styles.FormSection}>
                    <label htmlFor="email">Email Address</label>
                    <input type="text" id='email' name='email'  onChange={handleChange} required/>
                    </div>

                    <div className={styles.FormSection}>
                    <label htmlFor="password">Password</label>
                    <input type="password" id='password' name='password' onChange={handleChange} required/>
                    </div>

                    <button type='submit' className={styles.BtnSubmit}>CREATE ACCOUNT</button>
               </form>

               <p id={styles.Auth}>Authentification</p>
               <button id={styles.btnSignUpWithGoogle} type="button" onClick={handleGoogleSignIn}> <FaGoogle id={styles.GoogleIcon}/>  SIGN UP WITH GOOGLE</button>

               <p id={styles.LogIn}> <span id={styles.LogInRedirect}>Already have an account?</span>  Log In</p>
            </div>
            </div>
        </>
    )
}

export default SignUp