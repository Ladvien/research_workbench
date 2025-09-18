// Test file to demonstrate TEST-ORCHESTRATOR functionality
// This file intentionally has no tests to trigger alerts

pub fn untested_function() -> Result<String, &'static str> {
    Ok("This function needs tests".to_string())
}

pub async fn untested_async_function() -> Result<i32, Box<dyn std::error::Error>> {
    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    Ok(42)
}

pub struct UntestedStruct {
    pub value: String,
}

impl UntestedStruct {
    pub fn new(value: String) -> Self {
        Self { value }
    }

    pub fn process(&self) -> Result<String, &'static str> {
        if self.value.is_empty() {
            Err("Empty value")
        } else {
            Ok(format!("Processed: {}", self.value))
        }
    }
}