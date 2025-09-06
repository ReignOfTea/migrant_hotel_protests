import { Octokit } from '@octokit/rest';
import { config } from '../config/config.js';

const octokit = new Octokit({ auth: config.GITHUB_TOKEN });

export async function getFileContent(filePath) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            path: filePath
        });

        const content = Buffer.from(data.content, 'base64').toString();
        return { data: JSON.parse(content), sha: data.sha };
    } catch (error) {
        throw new Error(`Failed to fetch ${filePath}: ${error.message}`);
    }
}

export async function updateFileContent(filePath, newData, sha, commitMessage) {
    try {
        const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            path: filePath,
            message: commitMessage,
            content: Buffer.from(JSON.stringify(newData, null, 4)).toString('base64'),
            sha: sha
        });

        return response.data.commit.sha; // Return commit SHA for tracking
    } catch (error) {
        throw new Error(`Failed to update ${filePath}: ${error.message}`);
    }
}
