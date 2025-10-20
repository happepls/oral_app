import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');

    try {
      // Use email prefix as username for simplicity
      const username = email.split('@')[0];

      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
      });

      if (res.ok) {
        // Redirect to login page with a success message
        navigate('/login', { state: { message: 'Registration successful! Please log in.' } });
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Registration failed.');
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
        console.log('Registration/Login Success:', data);
        // Save the token and redirect
        localStorage.setItem('token', data.token);
        window.location.href = '/';
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Registration failed');
        console.error('Registration/Login Failed:', errorData.message);
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
      console.error('An error occurred during registration/login:', error);
    }
  };

  const handleGoogleFailure = (error) => {
    setError('Google Sign Up failed. Please try again.');
    console.error('Google Sign Up failed:', error);
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-md-center">
        <Col xs={12} md={6}>
          <h2 className="text-center mb-4">Register</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleRegister}>
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

            <Form.Group className="mb-3" controlId="formConfirmPassword">
              <Form.Label>Confirm Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Form.Group>

            <div className="d-grid gap-2">
              <Button variant="primary" type="submit">
                Register
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
            Already have an account? <Link to="/login">Login</Link>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default Register;