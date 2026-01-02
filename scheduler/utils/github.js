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

/**
 * Batch update multiple files in a single commit
 * @param {Array<{path: string, data: any, sha: string}>} files - Array of file updates with path, data, and sha
 * @param {string} commitMessage - Commit message for the batch update
 * @returns {Promise<string>} Commit SHA
 */
export async function batchUpdateFiles(files, commitMessage) {
    if (!files || files.length === 0) {
        throw new Error('No files provided for batch update');
    }

    try {
        // Get the current ref (branch)
        const { data: ref } = await octokit.rest.git.getRef({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            ref: 'heads/master'
        });

        // Get the current commit
        const { data: commit } = await octokit.rest.git.getCommit({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            commit_sha: ref.object.sha
        });

        // Create tree entries for all files to update
        const treeEntries = files.map(file => {
            const content = Buffer.from(JSON.stringify(file.data, null, 4)).toString('base64');
            return {
                path: file.path,
                mode: '100644', // Regular file
                type: 'blob',
                sha: null, // Will be created
                content: content
            };
        });

        // Create blobs for all files to update
        const blobPromises = treeEntries.map(async (entry) => {
            const { data: blob } = await octokit.rest.git.createBlob({
                owner: config.REPO_OWNER,
                repo: config.REPO_NAME,
                content: entry.content,
                encoding: 'base64'
            });
            return {
                path: entry.path,
                mode: entry.mode,
                type: entry.type,
                sha: blob.sha
            };
        });

        const newTreeEntries = await Promise.all(blobPromises);

        // Create the new tree using base_tree - this will include all existing files
        // and replace/update only the files we're modifying
        const { data: newTree } = await octokit.rest.git.createTree({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            base_tree: commit.tree.sha,
            tree: newTreeEntries
        });

        // Create the commit
        const { data: newCommit } = await octokit.rest.git.createCommit({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            message: commitMessage,
            tree: newTree.sha,
            parents: [commit.sha]
        });

        // Update the ref
        await octokit.rest.git.updateRef({
            owner: config.REPO_OWNER,
            repo: config.REPO_NAME,
            ref: 'heads/master',
            sha: newCommit.sha
        });

        return newCommit.sha;
    } catch (error) {
        throw new Error(`Failed to batch update files: ${error.message}`);
    }
}