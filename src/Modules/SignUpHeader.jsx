import styles from '../Modules/SignUpHeader.module.css'

function SignUpHeader({ setIsLogin }) {
    return (
        <>
            <div className={styles.Header}>
                <span className={styles.Brand}>AF</span>
                <div className={styles.Nav}>
                    <span id={styles.LogIn} onClick={() => setIsLogin(true)}>Login</span>
                    <span id={styles.Register} onClick={() => setIsLogin(false)}>Register</span>
                </div>
            </div>
        </>
    )
}

export default SignUpHeader