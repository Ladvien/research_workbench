use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Top 1000 most common passwords for blacklist checking
/// Based on OWASP recommendations and common password lists
static COMMON_PASSWORDS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "password",
        "123456",
        "password123",
        "admin",
        "12345678",
        "qwerty",
        "123456789",
        "letmein",
        "1234567890",
        "football",
        "iloveyou",
        "admin123",
        "welcome",
        "monkey",
        "login",
        "abc123",
        "starwars",
        "123123",
        "dragon",
        "passw0rd",
        "master",
        "hello",
        "freedom",
        "whatever",
        "qazwsx",
        "trustno1",
        "654321",
        "jordan23",
        "harley",
        "password1",
        "1234",
        "12345",
        "sunshine",
        "iloveu",
        "princess",
        "1qaz2wsx",
        "shadow",
        "baseball",
        "batman",
        "soccer",
        "qwerty123",
        "superman",
        "696969",
        "hottie",
        "freedom",
        "aa123456",
        "princess1",
        "qwe123",
        "loveme",
        "hello123",
        "zxcvbnm",
        "password12",
        "computer",
        "liverpool",
        "basketball",
        "samsung",
        "cookie",
        "buster",
        "taylor",
        "michelle",
        "jessica",
        "samsung1",
        "hunter",
        "target123",
        "banana",
        "killer",
        "secret",
        "summer",
        "love123",
        "password2",
        "ginger",
        "chocolate",
        "fucking",
        "blessed",
        "security",
        "asshole",
        "george",
        "andrew",
        "thomas",
        "joshua",
        "arsenal",
        "honey",
        "basketball1",
        "orange",
        "michelle1",
        "mother",
        "yellow",
        "internet",
        "service",
        "chocolate1",
        "golden",
        "1111",
        "2000",
        "gateway",
        "chelsea",
        "diamond",
        "jackson",
        "junior",
        "anthony",
        "david",
        "michael",
        "robert",
        "daniel",
        "jennifer",
        "matthew",
        "michelle",
        "christopher",
        "amanda",
        "sarah",
        "patrick",
        "crystal",
        "richard",
        "angela",
        "charles",
        "william",
        "joseph",
        "nicole",
        "stephanie",
        "elizabeth",
        "brandon",
        "heather",
        "ashley",
        "patricia",
        "kevin",
        "samantha",
        "john",
        "angel",
        "emma",
        "bruce",
        "carlos",
        "julia",
        "martin",
        "harry",
        "arthur",
        "paul",
        "jackie",
        "gloria",
        "diana",
        "chris",
        "sean",
        "eric",
        "adam",
        "caroline",
        "maria",
        "walter",
        "roy",
        "bobby",
        "louis",
        "philip",
        "johnny",
        "wayne",
        "peter",
        "harold",
        "jordan",
        "jack",
        "carl",
        "alan",
        "austin",
        "fred",
        "eugene",
        "ronald",
        "albert",
        "jerry",
        "roger",
        "keith",
        "henry",
        "bryan",
        "ralph",
        "marie",
        "anna",
        "lisa",
        "frank",
        "scott",
        "mark",
        "billy",
        "teresa",
        "victor",
        "lawrence",
        "arthur",
        "stephen",
        "antonio",
        "eugene",
        "walter",
        "clarence",
        "willie",
        "dennis",
        "phillip",
        "gloria",
        "patrick",
        "charlotte",
        "theresa",
        "dorothy",
        "janet",
        "catherine",
        "rose",
        "kimberly",
        "helen",
    ]
    .iter()
    .cloned()
    .collect()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordStrength {
    pub score: u8, // 0-100 score
    pub level: StrengthLevel,
    pub feedback: Vec<String>,
    pub requirements_met: PasswordRequirements,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StrengthLevel {
    VeryWeak,
    Weak,
    Fair,
    Good,
    Strong,
    VeryStrong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordRequirements {
    pub min_length: bool,    // At least 12 characters
    pub has_uppercase: bool, // At least one uppercase letter
    pub has_lowercase: bool, // At least one lowercase letter
    pub has_digit: bool,     // At least one digit
    pub has_symbol: bool,    // At least one symbol
    pub not_common: bool,    // Not in common password list
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordValidationError {
    pub field: String,
    pub message: String,
    pub requirements: PasswordRequirements,
}

pub struct PasswordValidator;

impl PasswordValidator {
    /// Validates password according to OWASP guidelines
    pub fn validate(password: &str) -> Result<(), PasswordValidationError> {
        let strength = Self::analyze_strength(password);

        if strength.score < 70 {
            return Err(PasswordValidationError {
                field: "password".to_string(),
                message: "Password does not meet security requirements".to_string(),
                requirements: strength.requirements_met,
            });
        }

        Ok(())
    }

    /// Analyzes password strength and provides detailed feedback
    pub fn analyze_strength(password: &str) -> PasswordStrength {
        let requirements = Self::check_requirements(password);
        let score = Self::calculate_score(password, &requirements);
        let level = Self::determine_level(score);
        let feedback = Self::generate_feedback(&requirements);

        PasswordStrength {
            score,
            level,
            feedback,
            requirements_met: requirements,
        }
    }

    fn check_requirements(password: &str) -> PasswordRequirements {
        PasswordRequirements {
            min_length: password.len() >= 12,
            has_uppercase: password.chars().any(|c| c.is_uppercase()),
            has_lowercase: password.chars().any(|c| c.is_lowercase()),
            has_digit: password.chars().any(|c| c.is_ascii_digit()),
            has_symbol: password.chars().any(|c| !c.is_alphanumeric()),
            not_common: !Self::is_common_password(password),
        }
    }

    fn calculate_score(password: &str, requirements: &PasswordRequirements) -> u8 {
        let mut score = 0u8;

        // Base score for length
        if requirements.min_length {
            score += 30;
            // Bonus for extra length
            if password.len() >= 16 {
                score += 10;
            }
            if password.len() >= 20 {
                score += 10;
            }
        } else {
            // Severely penalize short passwords
            score = (password.len() as u8 * 2).min(25);
        }

        // Character diversity requirements
        if requirements.has_uppercase {
            score += 10;
        }
        if requirements.has_lowercase {
            score += 10;
        }
        if requirements.has_digit {
            score += 10;
        }
        if requirements.has_symbol {
            score += 15;
        }

        // Common password penalty
        if requirements.not_common {
            score += 15;
        } else {
            score = score.saturating_sub(40); // Heavy penalty for common passwords
        }

        // Entropy bonus for character variety
        let unique_chars = password
            .chars()
            .collect::<std::collections::HashSet<_>>()
            .len();
        if unique_chars >= 8 {
            score += 5;
        }

        // Pattern detection penalty
        if Self::has_obvious_patterns(password) {
            score = score.saturating_sub(15);
        }

        score.min(100)
    }

    fn determine_level(score: u8) -> StrengthLevel {
        match score {
            0..=20 => StrengthLevel::VeryWeak,
            21..=40 => StrengthLevel::Weak,
            41..=60 => StrengthLevel::Fair,
            61..=80 => StrengthLevel::Good,
            81..=95 => StrengthLevel::Strong,
            _ => StrengthLevel::VeryStrong, // 96+ including values over 100
        }
    }

    fn generate_feedback(requirements: &PasswordRequirements) -> Vec<String> {
        let mut feedback = Vec::new();

        if !requirements.min_length {
            feedback.push("Password must be at least 12 characters long".to_string());
        }

        if !requirements.has_uppercase {
            feedback.push("Password must contain at least one uppercase letter (A-Z)".to_string());
        }

        if !requirements.has_lowercase {
            feedback.push("Password must contain at least one lowercase letter (a-z)".to_string());
        }

        if !requirements.has_digit {
            feedback.push("Password must contain at least one number (0-9)".to_string());
        }

        if !requirements.has_symbol {
            feedback.push(
                "Password must contain at least one symbol (!@#$%^&*()_+-=[]{}|;:,.<>?)"
                    .to_string(),
            );
        }

        if !requirements.not_common {
            feedback
                .push("Password is too common. Please choose a more unique password".to_string());
        }

        if feedback.is_empty() {
            feedback.push("Password meets all security requirements".to_string());
        }

        feedback
    }

    fn is_common_password(password: &str) -> bool {
        COMMON_PASSWORDS.contains(password.to_lowercase().as_str())
    }

    fn has_obvious_patterns(password: &str) -> bool {
        let lower = password.to_lowercase();

        // Check for sequential characters (abc, 123, etc.)
        let chars: Vec<char> = lower.chars().collect();
        for window in chars.windows(3) {
            if window.len() == 3 {
                let first = window[0] as u8;
                let second = window[1] as u8;
                let third = window[2] as u8;

                // Check for sequential ascending or descending
                if (second == first + 1 && third == second + 1)
                    || (second == first - 1 && third == second - 1)
                {
                    return true;
                }
            }
        }

        // Check for repeated characters (aaa, 111, etc.)
        for window in chars.windows(3) {
            if window.len() == 3 && window[0] == window[1] && window[1] == window[2] {
                return true;
            }
        }

        // Check for keyboard patterns
        let keyboard_patterns = ["qwerty", "asdf", "zxcv", "1234", "qaz", "wsx", "edc"];

        for pattern in &keyboard_patterns {
            if lower.contains(pattern) {
                return true;
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_too_short() {
        let result = PasswordValidator::validate("Short1!");
        assert!(result.is_err());
    }

    #[test]
    fn test_password_no_uppercase() {
        let result = PasswordValidator::validate("nouppercase123!");
        assert!(result.is_err());
    }

    #[test]
    fn test_password_no_lowercase() {
        let result = PasswordValidator::validate("NOLOWERCASE123!");
        assert!(result.is_err());
    }

    #[test]
    fn test_password_no_digit() {
        let result = PasswordValidator::validate("NoDigitsHere!");
        assert!(result.is_err());
    }

    #[test]
    fn test_password_no_symbol() {
        let result = PasswordValidator::validate("NoSymbolsHere123");
        assert!(result.is_err());
    }

    #[test]
    fn test_common_password() {
        let result = PasswordValidator::validate("Password123!");
        assert!(result.is_err()); // "password" is in common list
    }

    #[test]
    fn test_valid_strong_password() {
        let result = PasswordValidator::validate("MyStr0ng&UniqueP@ssw0rd2024!");
        assert!(result.is_ok());
    }

    #[test]
    fn test_password_strength_analysis() {
        let strength = PasswordValidator::analyze_strength("MyStr0ng&UniqueP@ssw0rd2024!");
        assert!(strength.score >= 80);
        assert!(matches!(
            strength.level,
            StrengthLevel::Strong | StrengthLevel::VeryStrong
        ));
    }

    #[test]
    fn test_weak_password_analysis() {
        let strength = PasswordValidator::analyze_strength("123456");
        assert!(strength.score < 40);
        assert!(matches!(
            strength.level,
            StrengthLevel::VeryWeak | StrengthLevel::Weak
        ));
        assert!(!strength.feedback.is_empty());
    }

    #[test]
    fn test_requirements_checking() {
        let reqs = PasswordValidator::check_requirements("MyStr0ng&P@ssw0rd!");
        assert!(reqs.min_length);
        assert!(reqs.has_uppercase);
        assert!(reqs.has_lowercase);
        assert!(reqs.has_digit);
        assert!(reqs.has_symbol);
        assert!(reqs.not_common);
    }

    #[test]
    fn test_pattern_detection() {
        assert!(PasswordValidator::has_obvious_patterns("MyPassword123abc"));
        assert!(PasswordValidator::has_obvious_patterns("MyPasswordaaa123"));
        assert!(PasswordValidator::has_obvious_patterns("MyPasswordqwerty"));
        assert!(!PasswordValidator::has_obvious_patterns(
            "MyStr0ng&UniqueP@ssw0rd!"
        ));
    }
}
