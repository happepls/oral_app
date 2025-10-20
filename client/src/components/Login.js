import { Link, useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const location = useLocation();

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Optional: clear the message from state so it doesn't reappear on refresh
      window.history.replaceState({}, document.title)
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        // Save the token and redirect
        localStorage.setItem('token', data.token);
        window.location.href = '/';
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Login failed.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch(`/api/users/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Login Success:', data);
        // Save the token and redirect
        localStorage.setItem('token', data.token);
        window.location.href = '/';
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Login failed');
        console.error('Login Failed:', errorData.message);
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
      console.error('An error occurred during login:', error);
    }
  };

  const handleGoogleFailure = (error) => {
    setError('Google Sign In failed. Please try again.');
    console.error('Google Sign In failed:', error);
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-md-center">
        <Col xs={12} md={6}>
          <h2 className="text-center mb-4">Login</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          <Form onSubmit={handleLogin}>
            <Form.Group className="mb-3" controlId="formBasicEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="formBasicPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>

            <div className="d-grid gap-2">
              <Button variant="primary" type="submit">
                Login
              </Button>
            </div>
          </Form>
          <div className="text-center my-3">or</div>
          <div className="d-flex justify-content-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleFailure}
            />
          </div>
          <div className="mt-3 text-center">
            Don't have an account? <Link to="/register">Register</Link>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;
