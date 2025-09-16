import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';

interface RegisterFormData {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

interface RegisterProps {
  onSubmit: (data: Omit<RegisterFormData, 'confirmPassword'>) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  onSwitchToLogin?: () => void;
}

export const Register: React.FC<RegisterProps> = ({
  onSubmit,
  isLoading = false,
  error = null,
  onSwitchToLogin
}) => {
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<RegisterFormData>>({});

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): { isValid: boolean; errors: string[]; strength: PasswordStrength } => {
    const errors: string[] = [];
    const requirements = {
      minLength: password.length >= 12,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasDigit: /\d/.test(password),
      hasSymbol: /[^A-Za-z0-9]/.test(password),
      notCommon: !isCommonPassword(password)
    };

    if (!requirements.minLength) {
      errors.push('At least 12 characters');
    }
    if (!requirements.hasUppercase) {
      errors.push('One uppercase letter (A-Z)');
    }
    if (!requirements.hasLowercase) {
      errors.push('One lowercase letter (a-z)');
    }
    if (!requirements.hasDigit) {
      errors.push('One number (0-9)');
    }
    if (!requirements.hasSymbol) {
      errors.push('One symbol (!@#$%^&*()_+-=[]{}|;:,.<>?)');
    }
    if (!requirements.notCommon) {
      errors.push('Password is too common, please choose a more unique password');
    }

    const strength = calculatePasswordStrength(password, requirements);

    return { isValid: errors.length === 0 && strength.score >= 70, errors, strength };
  };

  const validateField = (name: keyof RegisterFormData, value: string, allFormData: RegisterFormData): string | null => {
    switch (name) {
      case 'email':
        if (!value.trim()) {
          return 'Email is required';
        }
        if (!validateEmail(value)) {
          return 'Please enter a valid email address';
        }
        return null;
      case 'username':
        if (!value.trim()) {
          return 'Username is required';
        }
        if (value.length < 3) {
          return 'Username must be at least 3 characters';
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return 'Username can only contain letters, numbers, underscores, and hyphens';
        }
        return null;
      case 'password':
        if (!value) {
          return 'Password is required';
        }
        const { isValid, errors } = validatePassword(value);
        if (!isValid) {
          return errors.length > 3 ? `Password requirements: ${errors.slice(0, 3).join(', ')}...` : `Password must have: ${errors.join(', ')}`;
        }
        return null;
      case 'confirmPassword':
        if (!value) {
          return 'Please confirm your password';
        }
        if (value !== allFormData.password) {
          return 'Passwords do not match';
        }
        return null;
      default:
        return null;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const fieldName = name as keyof RegisterFormData;

    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);

    // Clear validation error for this field when user starts typing
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => ({ ...prev, [fieldName]: undefined }));
    }

    // Re-validate confirm password if password changes
    if (name === 'password' && formData.confirmPassword) {
      const confirmPasswordError = validateField('confirmPassword', formData.confirmPassword, newFormData);
      if (confirmPasswordError) {
        setValidationErrors(prev => ({ ...prev, confirmPassword: confirmPasswordError }));
      } else {
        setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const errors: Partial<RegisterFormData> = {};
    (Object.keys(formData) as Array<keyof RegisterFormData>).forEach(key => {
      const error = validateField(key, formData[key], formData);
      if (error) {
        errors[key] = error;
      }
    });

    setValidationErrors(errors);

    // If there are validation errors, don't submit
    if (Object.keys(errors).length > 0) {
      return;
    }

    const { confirmPassword, ...submitData } = formData;
    await onSubmit(submitData);
  };

  // Common passwords list (top 100 most common)
  const commonPasswords = new Set([
    'password', '123456', 'password123', 'admin', '12345678', 'qwerty', '123456789',
    'letmein', '1234567890', 'football', 'iloveyou', 'admin123', 'welcome', 'monkey',
    'login', 'abc123', 'starwars', '123123', 'dragon', 'passw0rd', 'master', 'hello',
    'freedom', 'whatever', 'qazwsx', 'trustno1', '654321', 'jordan23', 'harley',
    'password1', '1234', '12345', 'sunshine', 'iloveu', 'princess', '1qaz2wsx',
    'shadow', 'baseball', 'batman', 'soccer', 'qwerty123', 'superman', '696969',
    'hottie', 'aa123456', 'princess1', 'qwe123', 'loveme', 'hello123', 'zxcvbnm',
    'password12', 'computer', 'liverpool', 'basketball', 'samsung', 'cookie',
    'buster', 'taylor', 'michelle', 'jessica', 'samsung1', 'hunter', 'target123',
    'banana', 'killer', 'secret', 'summer', 'love123', 'password2', 'ginger',
    'chocolate', 'blessed', 'security', 'asshole', 'george', 'andrew', 'thomas',
    'joshua', 'arsenal', 'honey', 'basketball1', 'orange', 'michelle1', 'mother',
    'yellow', 'internet', 'service', 'chocolate1', 'golden', '1111', '2000',
    'gateway', 'chelsea', 'diamond', 'jackson', 'junior', 'anthony', 'david',
    'michael', 'robert', 'daniel', 'jennifer', 'matthew', 'christopher', 'amanda',
    'sarah', 'patrick', 'crystal', 'richard', 'angela', 'charles', 'william',
    'joseph', 'nicole', 'stephanie', 'elizabeth', 'brandon', 'heather', 'ashley'
  ]);

  const isCommonPassword = (password: string): boolean => {
    return commonPasswords.has(password.toLowerCase());
  };

  interface PasswordStrength {
    score: number;
    level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
    feedback: string[];
  }

  const calculatePasswordStrength = (password: string, requirements: any): PasswordStrength => {
    let score = 0;
    const feedback: string[] = [];

    // Base score for length
    if (requirements.minLength) {
      score += 30;
      if (password.length >= 16) score += 10;
      if (password.length >= 20) score += 10;
    } else {
      score = Math.max(0, Math.min(25, password.length * 2));
      feedback.push(`Password needs ${12 - password.length} more characters`);
    }

    // Character diversity requirements
    if (requirements.hasUppercase) score += 10;
    else feedback.push('Add uppercase letters');

    if (requirements.hasLowercase) score += 10;
    else feedback.push('Add lowercase letters');

    if (requirements.hasDigit) score += 10;
    else feedback.push('Add numbers');

    if (requirements.hasSymbol) score += 15;
    else feedback.push('Add symbols (!@#$%^&*)');

    // Common password penalty
    if (requirements.notCommon) {
      score += 15;
    } else {
      score = Math.max(0, score - 40);
      feedback.push('Choose a more unique password');
    }

    // Pattern detection (basic)
    if (hasObviousPatterns(password)) {
      score = Math.max(0, score - 15);
      feedback.push('Avoid obvious patterns');
    }

    // Determine level
    let level: PasswordStrength['level'];
    if (score <= 20) level = 'very-weak';
    else if (score <= 40) level = 'weak';
    else if (score <= 60) level = 'fair';
    else if (score <= 80) level = 'good';
    else if (score <= 95) level = 'strong';
    else level = 'very-strong';

    if (feedback.length === 0 && score >= 70) {
      feedback.push('Strong password!');
    }

    return { score: Math.min(100, score), level, feedback };
  };

  const hasObviousPatterns = (password: string): boolean => {
    const lower = password.toLowerCase();

    // Check for sequential characters (abc, 123, etc.)
    for (let i = 0; i < lower.length - 2; i++) {
      const char1 = lower.charCodeAt(i);
      const char2 = lower.charCodeAt(i + 1);
      const char3 = lower.charCodeAt(i + 2);

      if ((char2 === char1 + 1 && char3 === char2 + 1) ||
          (char2 === char1 - 1 && char3 === char2 - 1)) {
        return true;
      }

      // Check for repeated characters
      if (char1 === char2 && char2 === char3) {
        return true;
      }
    }

    // Check for keyboard patterns
    const patterns = ['qwerty', 'asdf', 'zxcv', '1234', 'qaz', 'wsx'];
    return patterns.some(pattern => lower.includes(pattern));
  };

  const passwordValidation = validatePassword(formData.password);
  const passwordStrength = passwordValidation.strength || { score: 0, level: 'very-weak', feedback: [] };
  const isFormValid = Object.keys(formData).every(key => formData[key as keyof RegisterFormData].trim()) &&
                     Object.keys(validationErrors).length === 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <User className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Join Workbench LLM Chat and start your AI-powered conversations.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
              <div className="text-sm text-red-700 dark:text-red-400" role="alert">
                {error}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`appearance-none relative block w-full pl-10 pr-3 py-2 border rounded-md placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm ${
                    validationErrors.email
                      ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
              </div>
              {validationErrors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {validationErrors.email}
                </p>
              )}
            </div>

            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className={`appearance-none relative block w-full pl-10 pr-3 py-2 border rounded-md placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm ${
                    validationErrors.username
                      ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                  placeholder="Choose a username"
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
              </div>
              {validationErrors.username && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {validationErrors.username}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={`appearance-none relative block w-full pl-10 pr-10 py-2 border rounded-md placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm ${
                    validationErrors.password
                      ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-500" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-500" />
                  )}
                </button>
              </div>
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className={`h-1 rounded-full transition-all duration-300 ${
                          passwordStrength.strength === 'weak'
                            ? 'bg-red-500 w-1/3'
                            : passwordStrength.strength === 'medium'
                            ? 'bg-yellow-500 w-2/3'
                            : 'bg-green-500 w-full'
                        }`}
                      />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        passwordStrength.strength === 'weak'
                          ? 'text-red-600 dark:text-red-400'
                          : passwordStrength.strength === 'medium'
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {passwordStrength.strength.charAt(0).toUpperCase() + passwordStrength.strength.slice(1)}
                    </span>
                  </div>
                </div>
              )}
              {validationErrors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {validationErrors.password}
                </p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={`appearance-none relative block w-full pl-10 pr-10 py-2 border rounded-md placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm ${
                    validationErrors.confirmPassword
                      ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-500" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-500" />
                  )}
                </button>
              </div>
              {validationErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {validationErrors.confirmPassword}
                </p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                !isFormValid || isLoading
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Creating account...
                </div>
              ) : (
                'Create account'
              )}
            </button>
          </div>

          {onSwitchToLogin && (
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToLogin}
                  className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  disabled={isLoading}
                >
                  Sign in here
                </button>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};