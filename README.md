## Kibo Import Export (CLI Tool)

This CLI tool provides utilities for working with the Kibo Import Export API.

### Prerequisites

Ensure you have Node.js 16+ installed.

### Setup

1. Install dependencies:
   ```bash
   npm install @kibocommerce/import-export-cli -g
   ```

2. Make sure the `.env` file is set up with the required environment variables:
   - `API_URL`: The API endpoint.
   - `CLIENT_ID`: Client ID for the API.
   - `CLIENT_SECRET`: Client secret for the API.

   You can use the `init-env` command to create an empty `.env` file.
    ```bash
   kibo-import-export init-env
   ```

### Available Commands

- `validate`: runs thru local validatoin
- `validate-config`: Validate the configuration settings.
- `init-env`: Creates an empty `.env` file.

### Available Options

- `all`: include all files
- `directory`: location of the csv files
- `product-type-attributes`: include the productTypeAttributes file

### Usage

To use the CLI tool, run the following command:

```bash
kibo-import-export [command] [options]
```

Replace `[command]` with any of the available commands listed above.

Example:
```bash
kibo-import-export validate --all
```

### Environment Variables

Make sure you set up the following environment variables in your `.env` file:

```plaintext
API_URL=https://t***.com/api
CLIENT_ID=YourClientID
CLIENT_SECRET=YourClientSecret
```

### Contributing

Please raise an issue or pull request on our GitHub repository if you have any fixes, enhancements, or suggestions.

### License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

---

If you have any issues, please reach out to our support team or check our documentation for more details.








//create a readme from bin/index
Catalog Validator
Catalog Validator is a command-line tool for validating catalog data against a remote API. It uses the CatalogFetcher and Validator classes to fetch and validate catalog data.

Installation
To install Catalog Validator, run the following command:

Usage
Catalog Validator can be used to validate catalog data in a directory. The following options are available:

--directory (-d): The directory to process. Defaults to the current directory.
--all: Validate all files in the directory.
--product-type-attributes: Validate only the productTypeAttributes file.
To validate catalog data, run the following command:

To validate the productTypeAttributes file, run the following command:

To create an empty .env file, run the following command:

Configuration
Catalog Validator requires the following environment variables to be set:

API_URL: The URL of the remote API.
CLIENT_ID: The client ID for accessing the remote API.
CLIENT_SECRET: The client secret for accessing the remote API.
License
Catalog Validator is licensed under the MIT License.