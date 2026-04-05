import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle } from "react-icons/fa";
import styles from '../Modules/SignUpForm.module.css'
import { supabase } from '../Modules/SupabaseClient';

const Login = () => {

  let navigate = useNavigate()

  const [formData, setFormData] = useState({
    email: '', password: ''
  })



  function handleChange(event) {
    setFormData((prevFormData) => {
      return {
        ...prevFormData,
        [event.target.name]: event.target.value
      }

    })

  }

  async function handleSubmit(e) {
    e.preventDefault()

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (error) throw error
      console.log(data)
      navigate('/dashboard')
      //   alert('Check your email for verification link')


    } catch (error) {
      alert(error.message)
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

  return (
    <>
      <div className={styles.Wrapper}>
        <div className={styles.FormContainer}>
          <p id={styles.SignUpText}>Log In</p>
          <p id={styles.SignUpSubText}>Access automotive listings &<br /> live auction events </p>
          <form onSubmit={handleSubmit} className={styles.form}>

            <div className={styles.FormSection}>
              <label htmlFor="email">Email</label>
              <input type="email" id='email' name='email' value={formData.email} onChange={handleChange} required />
            </div>

            <div className={styles.FormSection}>
              <label htmlFor="password">Password</label>
              <input type="password" id='password' name='password' value={formData.password} onChange={handleChange} required />
            </div>


            <button type='submit' className={styles.BtnSubmit}>LOG IN</button>
          </form>

          <p id={styles.Auth}>Authentication</p>
          <button id={styles.btnSignUpWithGoogle} type="button" onClick={handleGoogleSignIn}> <FaGoogle id={styles.GoogleIcon} />  LOG IN WITH GOOGLE</button>

          <p id={styles.LogIn}> <span id={styles.LogInRedirect}>Don't Have An Account?</span> <Link to="/signup">Create One</Link></p>
        </div>
      </div>
    </>
  )
}

export default Login