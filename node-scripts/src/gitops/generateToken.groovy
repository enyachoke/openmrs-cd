def generateToken() {
    try {
        // Get the admin user
        def user = Jenkins.instance.getUser('admin')
        def tokenProperty = user.getProperty(jenkins.security.ApiTokenProperty.class)
        
        // Generate new token
        def result = tokenProperty.tokenStore.generateNewToken('gitops-script-token')
        def token = result.plainValue
        
        // Set only the API token as environment variable
        def build = Thread.currentThread().executable
        build.buildEnvironments.add(new hudson.EnvVars([
            "JENKINS_API_TOKEN": token
        ]))
        
        println "Token generated successfully and set as JENKINS_API_TOKEN"
        return 0
        
    } catch (Exception e) {
        println "Error generating token: ${e.message}"
        return 1
    }
}

// Execute the function
return generateToken()