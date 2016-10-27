/* eslint-env mocha */
/* global expect, testContext */
/* eslint-disable prefer-arrow-callback, no-unused-expressions */
/* eslint array-callback-return: "off"*/
import factory from 'src/test/factories'
import {withDBCleanup, useFixture} from 'src/test/helpers'
import {STAT_DESCRIPTORS} from 'src/common/models/stat'

import getLatestFeedbackStats from 'src/server/actions/getLatestFeedbackStats'

const {TECHNICAL_HEALTH, CULTURE_CONTRIBUTION, TEAM_PLAY} = STAT_DESCRIPTORS

describe(testContext(__filename), function () {
  withDBCleanup()
  useFixture.buildSurvey()

  beforeEach('Setup Survey Data', async function () {
    this.stats = {}
    this.feedbackQuestions = {}

    const feedbackStatDescriptors = [
      TECHNICAL_HEALTH,
      CULTURE_CONTRIBUTION,
      TEAM_PLAY,
    ]

    await Promise.all(
      Object.values(feedbackStatDescriptors).map(async descriptor => {
        this.stats[descriptor] = await factory.create('stat', {descriptor})
      })
    )

    await Promise.all(feedbackStatDescriptors.map(statDescriptor =>
      factory.create('question', {
        responseType: 'likert7Agreement',
        subjectType: 'player',
        statId: this.stats[statDescriptor].id,
      }).then(q => {
        this.feedbackQuestions[statDescriptor] = q
      })
    ))

    await this.buildSurvey(
      feedbackStatDescriptors.map(statDescriptor => ({
        questionId: this.feedbackQuestions[statDescriptor].id,
        subjectIds: () => this.teamPlayerIds
      }))
    )

    const [subjectId, respondentId] = this.teamPlayerIds
    this.subjectId = subjectId
    this.respondentId = respondentId
  })

  it('returns the response values converted to a 0-100 scale', async function () {
    await _createResponses(this, {[TECHNICAL_HEALTH]: 3, [CULTURE_CONTRIBUTION]: 7, [TEAM_PLAY]: 6})
    return expect(getLatestFeedbackStats({subjectId: this.subjectId, respondentId: this.respondentId})).to.eventually.deep.eq({
      [TECHNICAL_HEALTH]: 33,
      [CULTURE_CONTRIBUTION]: 100,
      [TEAM_PLAY]: 83,
    })
  })

  it('returns undefined when no feedback available', function () {
    return expect(getLatestFeedbackStats({subjectId: this.subjectId, respondentId: this.respondentId})).to.eventually.deep.eq(undefined)
  })

  it('returns undefined when feedback is "not enough information"', async function () {
    await _createResponses(this, {[TECHNICAL_HEALTH]: 0, [CULTURE_CONTRIBUTION]: 0, [TEAM_PLAY]: 0})
    const result = await getLatestFeedbackStats({subjectId: this.subjectId, respondentId: this.respondentId})
    expect(result[CULTURE_CONTRIBUTION]).to.be.undefined
    expect(result[TECHNICAL_HEALTH]).to.be.undefined
    expect(result[TEAM_PLAY]).to.be.undefined
  })

  it('returns undefined for individual stats if they\'re nor available', async function () {
    await _createResponses(this, {[TEAM_PLAY]: 3})
    return expect(getLatestFeedbackStats({subjectId: this.subjectId, respondentId: this.respondentId})).to.eventually.deep.eq({[TEAM_PLAY]: 33})
  })
})

function _createResponses(test, values) {
  const {
    respondentId,
    subjectId,
    feedbackQuestions,
  } = test

  const surveyId = test.survey.id

  const responses = []

  Object.keys(feedbackQuestions).forEach(statDescriptor => {
    if ({}.hasOwnProperty.call(values, statDescriptor)) {
      responses.push({
        questionId: feedbackQuestions[statDescriptor].id, surveyId, respondentId, subjectId, value: values[statDescriptor]
      })
    }
  })

  return factory.createMany('response', responses)
}